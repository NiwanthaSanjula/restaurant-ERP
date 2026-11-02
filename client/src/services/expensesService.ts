import { showErrorToast } from "../utils/toast";
import { getExpenseCategories, getExpenses } from "./expenseService";

type ExpensesReportParams = {
  fromDate?: string;
  toDate?: string;
  warehouseId?: string;
  page?: number;
  limit?: number;
};

type ExpensesReportResponse<T> = {
  status: string;
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  summary: Record<string, number>;
};

const paginate = <T>(rows: T[], page = 1, limit = 10) => {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * limit;
  const end = start + limit;
  return {
    rows: rows.slice(start, end),
    pagination: {
      total,
      page: safePage,
      limit,
      totalPages,
    },
  };
};

export const getExpensesReport = async (
  params: ExpensesReportParams
): Promise<ExpensesReportResponse<any>> => {
  const res = await getExpenses({
    startDate: params.fromDate,
    endDate: params.toDate,
    warehouse: params.warehouseId,
    page: params.page,
    limit: params.limit,
  });

  const data = Array.isArray(res?.data) ? res.data : [];
  const totalAmount = Number(res?.summary?.totalExpenses ?? 0);
  const pagination =
    res?.pagination ??
    paginate(data, params.page ?? 1, params.limit ?? 10).pagination;

  return {
    status: res?.status || "success",
    data,
    pagination,
    summary: {
      totalAmount,
    },
  };
};

export const getExpenseCategoriesReport = async (
  params: ExpensesReportParams
): Promise<ExpensesReportResponse<any>> => {
  try {
    const [categoriesRes, expensesRes] = await Promise.all([
      getExpenseCategories(),
      getExpenses({
        startDate: params.fromDate,
        endDate: params.toDate,
        warehouse: params.warehouseId,
        limit: 5000,
      }),
    ]);

    const categories = Array.isArray(categoriesRes?.data) ? categoriesRes.data : [];
    const expenses = Array.isArray(expensesRes?.data) ? expensesRes.data : [];

  const bucket = new Map<
    string,
    {
      categoryId?: string;
      name: string;
      description: string;
      totalAmount: number;
      transactions: number;
    }
  >();

  categories.forEach((c: any) => {
    const key = String(c?._id || c?.name || "");
    bucket.set(key, {
      categoryId: c?._id,
      name: c?.name || "Uncategorized",
      description: c?.description || "",
      totalAmount: 0,
      transactions: 0,
    });
  });

  expenses.forEach((e: any) => {
    const category = e?.category;
    const categoryId =
      typeof category === "string" ? category : category?._id || "";
    const categoryName =
      typeof category === "string" ? category : category?.name || "Uncategorized";
    const key = String(categoryId || categoryName);

    if (!bucket.has(key)) {
      bucket.set(key, {
        categoryId: categoryId || undefined,
        name: categoryName || "Uncategorized",
        description: "",
        totalAmount: 0,
        transactions: 0,
      });
    }

    const row = bucket.get(key)!;
    row.totalAmount += Number(e?.amount || 0);
    row.transactions += 1;
  });

  const allRows = Array.from(bucket.values()).sort(
    (a, b) => b.totalAmount - a.totalAmount
  );
  const { rows, pagination } = paginate(
    allRows,
    params.page ?? 1,
    params.limit ?? 10
  );

  return {
    status: "success",
    data: rows,
    pagination,
    summary: {
      totalCategories: allRows.length,
    },
  };
  } catch (error: any) {
    showErrorToast("Failed to fetch report data. Some filters may be missing.");
    return {
      status: "error",
      data: [],
      pagination: { total: 0, page: params.page ?? 1, limit: params.limit ?? 10, totalPages: 0 },
      summary: { totalCategories: 0 }
    };
  }
};

