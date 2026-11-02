// Expense API service functions

const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export interface ExpenseFilters {
  q?: string;
  category?: string;
  warehouse?: string;
  minAmount?: string;
  maxAmount?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface ExpenseData {
  date: string;
  title: string;
  warehouse: string;
  category: string;
  amount: number;
  details?: string;
}

export interface ExpenseCategoryData {
  name: string;
  description?: string;
}

// Expenses
export const getExpenses = async (filters: ExpenseFilters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.q) params.append('q', filters.q);
  if (filters.category) params.append('category', filters.category);
  if (filters.warehouse) params.append('warehouse', filters.warehouse);
  if (filters.minAmount) params.append('minAmount', filters.minAmount);
  if (filters.maxAmount) params.append('maxAmount', filters.maxAmount);
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());
  
  const queryString = params.toString();
  const url = `${api}/expenses${queryString ? `?${queryString}` : ''}`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch expenses');
  return data;
};

export const getExpenseById = async (id: string) => {
  const res = await fetch(`${api}/expenses/${id}`, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch expense');
  return data;
};

export const createExpense = async (expenseData: ExpenseData) => {
  const res = await fetch(`${api}/expenses`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(expenseData)
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to create expense');
  return data;
};

export const updateExpense = async (id: string, expenseData: Partial<ExpenseData>) => {
  const res = await fetch(`${api}/expenses/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(expenseData)
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to update expense');
  return data;
};

export const deleteExpense = async (id: string) => {
  const res = await fetch(`${api}/expenses/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to delete expense');
  return data;
};

// Expense Categories
export const getExpenseCategories = async () => {
  const res = await fetch(`${api}/expense-categories`, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch expense categories');
  return data;
};

export const getExpenseCategoryById = async (id: string) => {
  const res = await fetch(`${api}/expense-categories/${id}`, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch expense category');
  return data;
};

export const createExpenseCategory = async (categoryData: ExpenseCategoryData) => {
  const res = await fetch(`${api}/expense-categories`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(categoryData)
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to create expense category');
  return data;
};

export const updateExpenseCategory = async (id: string, categoryData: Partial<ExpenseCategoryData>) => {
  const res = await fetch(`${api}/expense-categories/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(categoryData)
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to update expense category');
  return data;
};

export const deleteExpenseCategory = async (id: string) => {
  const res = await fetch(`${api}/expense-categories/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to delete expense category');
  return data;
};

export const checkExpenseCategoryInUse = async (id: string): Promise<{
  status: string;
  isInUse: boolean;
  expenseTitle: string | null;
}> => {
  const res = await fetch(`${api}/expense-categories/${id}/check-in-use`, {
    method: 'GET',
    headers: getAuthHeaders()
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to check category usage');
  return data;
};
