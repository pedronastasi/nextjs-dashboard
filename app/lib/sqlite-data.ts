import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  User,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export async function fetchRevenue() {
  try {
    const db = await open({
      filename: './db.sqlite',
      driver: sqlite3.Database,
    });

    const data = await db.all<Revenue[]>('SELECT * FROM revenue');
    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
}

export async function fetchLatestInvoices() {
  try {
    const db = await open({
      filename: './db.sqlite',
      driver: sqlite3.Database,
    });

    const data = await db.all<LatestInvoiceRaw[]>(`
    SELECT invoices.amount, customers.name, customers.image_url, customers.email, invoices.id
    FROM invoices
    JOIN customers ON invoices.customer_id = customers.id
    ORDER BY invoices.date DESC
    LIMIT 5
  `);

    const latestInvoices = data.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {
  try {
    const db = await open({
      filename: './db.sqlite',
      driver: sqlite3.Database,
    });

    const invoiceCountPromise = db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM invoices',
    );
    const customerCountPromise = db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM customers',
    );
    const invoiceStatusPromise = db.get<{ paid: number; pending: number }>(`
    SELECT
      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS paid,
      SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS pending
    FROM invoices
  `);

    const [invoiceCount, customerCount, invoiceStatus] = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = invoiceCount?.count ?? 0;
    const numberOfCustomers = customerCount?.count ?? 0;
    const totalPaidInvoices = formatCurrency(invoiceStatus?.paid ?? 0);
    const totalPendingInvoices = formatCurrency(invoiceStatus?.pending ?? 0);

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    const db = await open({
      filename: './db.sqlite',
      driver: sqlite3.Database,
    });

    const invoices = await db.all<InvoicesTable>(
      `
    SELECT
      invoices.id,
      invoices.amount,
      invoices.date,
      invoices.status,
      customers.name,
      customers.email,
      customers.image_url
    FROM invoices
    JOIN customers ON invoices.customer_id = customers.id
    WHERE
      customers.name LIKE '%' || ? || '%' OR
      customers.email LIKE '%' || ? || '%' OR
      invoices.amount LIKE '%' || ? || '%' OR
      invoices.date LIKE '%' || ? || '%' OR
      invoices.status LIKE '%' || ? || '%'
    ORDER BY invoices.date DESC
    LIMIT ? OFFSET ?
  `,
      [query, query, query, query, query, ITEMS_PER_PAGE, offset],
    );

    return invoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(query: string) {
  try {
    const db = await open({
      filename: './db.sqlite',
      driver: sqlite3.Database,
    });

    const count = await db.get<{ count: number }>(
      `
    SELECT COUNT(*)
    FROM invoices
    JOIN customers ON invoices.customer_id = customers.id
    WHERE
      customers.name LIKE '%' || ? || '%' OR
      customers.email LIKE '%' || ? || '%' OR
      invoices.amount LIKE '%' || ? || '%' OR
      invoices.date LIKE '%' || ? || '%' OR
      invoices.status LIKE '%' || ? || '%'
  `,
      [query, query, query, query, query],
    );

    const totalPages = Math.ceil(count?.count || 0 / ITEMS_PER_PAGE) || 0;
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    const db = await open({
      filename: './db.sqlite',
      driver: sqlite3.Database,
    });

    const data = await db.get<InvoiceForm>(
      `
    SELECT
      invoices.id,
      invoices.customer_id,
      invoices.amount,
      invoices.status
    FROM invoices
    WHERE invoices.id = ?
  `,
      [id],
    );

    const invoice = data
      ? {
          ...data,
          amount: data.amount / 100,
        }
      : null;

    return invoice;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers() {
  try {
    const db = await open({
      filename: './db.sqlite',
      driver: sqlite3.Database,
    });

    const data = await db.all<CustomerField>(`
    SELECT
      id,
      name
    FROM customers
    ORDER BY name ASC
  `);

    const customers = data;
    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const db = await open({
      filename: './db.sqlite',
      driver: sqlite3.Database,
    });

    const data = await db.all<CustomersTableType[]>(
      `
    SELECT
      customers.id,
      customers.name,
      customers.email,
      customers.image_url,
      COUNT(invoices.id) AS total_invoices,
      SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
      SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
    FROM customers
    LEFT JOIN invoices ON customers.id = invoices.customer_id
    WHERE
      customers.name LIKE '%' || ? || '%' OR
      customers.email LIKE '%' || ? || '%'
    GROUP BY customers.id, customers.name, customers.email, customers.image_url
    ORDER BY customers.name ASC
  `,
      [query, query],
    );

    const customers = data.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch customer table.');
  }
}

export async function getUser(email: string) {
  try {
    const db = await open({
      filename: './db.sqlite',
      driver: sqlite3.Database,
    });

    const user = await db.get<User>('SELECT * FROM users WHERE email = ?', [
      email,
    ]);
    return user;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw new Error('Failed to fetch user.');
  }
}
