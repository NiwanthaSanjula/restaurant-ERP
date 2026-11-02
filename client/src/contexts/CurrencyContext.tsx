import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { currencyService, type Currency } from '../services/currencyService';
import { settingService } from '../services/settingService';

interface CurrencyContextType {
  currencies: Currency[];
  selectedCurrency: Currency | null;
  currency: Currency | null;
  currencyCode: string;
  currencySymbol: string;
  setCurrencyById: (currencyId: string) => void;
  refreshCurrencies: () => Promise<void>;
  formatAmount: (amount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};

const EMPTY_CURRENCY_CODE = 'LKR';
const EMPTY_CURRENCY_SYMBOL = 'Rs.';

export const CurrencyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(null);

  const resolveCurrency = (currencyIdOrCode: string | undefined, available: Currency[]) => {
    if (!currencyIdOrCode) return null;
    return available.find((currency) => currency._id === currencyIdOrCode || currency.code === currencyIdOrCode) || null;
  };

  const refreshCurrencies = async () => {
    try {
      const res = await currencyService.getCurrencies();
      setCurrencies(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Failed to refresh currencies:', e);
    }
  };

  const setCurrencyById = (currencyId: string) => {
    const selected = resolveCurrency(currencyId, currencies);
    if (selected) {
      setSelectedCurrency(selected);
      return;
    }

    setSelectedCurrency(null);
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [currencyResult, settingsResult] = await Promise.allSettled([
          currencyService.getCurrencies(),
          settingService.getSettings()
        ]);

        const available =
          currencyResult.status === 'fulfilled' && Array.isArray(currencyResult.value?.data)
            ? currencyResult.value.data
            : [];

        setCurrencies(available);

        const savedCurrency =
          settingsResult.status === 'fulfilled'
            ? (settingsResult.value?.data?.system?.currency as string | undefined)
            : undefined;

        const selectedFromSettings = resolveCurrency(savedCurrency, available);
        setSelectedCurrency(selectedFromSettings || available[0] || null);
      } catch (e) {
        console.error('Currency bootstrap failed:', e);
      }
    };

    bootstrap();
  }, []);
  const value = useMemo<CurrencyContextType>(() => ({
    currencies,
    selectedCurrency,

    currency: selectedCurrency,

    currencyCode:
      (selectedCurrency?.code || currencies[0]?.code || EMPTY_CURRENCY_CODE).trim() ||
      EMPTY_CURRENCY_CODE,

    currencySymbol:
      (selectedCurrency?.symbol || currencies[0]?.symbol || EMPTY_CURRENCY_SYMBOL).trim() ||
      EMPTY_CURRENCY_SYMBOL,

    setCurrencyById,
    refreshCurrencies,

    formatAmount: (amount: number) => {
      const symbol =
        selectedCurrency?.symbol ||
        currencies[0]?.symbol ||
        EMPTY_CURRENCY_SYMBOL;

      return `${symbol} ${Number(amount).toFixed(2)}`.trim();
    }
  }), [currencies, selectedCurrency]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};
