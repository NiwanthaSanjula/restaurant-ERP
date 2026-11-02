const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;

export interface SpecialOffer {
  _id: string;
  offerName: string;
  percentage: number;
  endDate?: string;
  status: "Active" | "Expired" | "Disabled";
  createdBy: string;
  createdAt: string;
}

export const getActiveOffers = async (): Promise<SpecialOffer[]> => {
  try {
    const token = sessionStorage.getItem("token");
    const response = await fetch(`${API_BASE}/specialOffers`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.warn(`Special offers API returned status ${response.status}`);
      return [];
    }

    const data = await response.json();
    const offers = data?.data ?? data ?? [];
    
    if (!Array.isArray(offers)) {
      console.warn("Special offers response is not an array:", data);
      return [];
    }
    
    return offers;
  } catch (error) {
    console.error("Error fetching special offers:", error);
    return [];
  }
};
