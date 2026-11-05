import { ArrowLeft, Building2, Edit, Mail, MapPin, Phone, User } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useBranding } from '../../contexts/BrandingProvider';
import { getSaleById } from '../../services/saleService';
import { settingService } from '../../services/settingService';
import { showErrorToast } from '../../utils/toast';
import Loader from '../common/Loader';
import { formatDate } from '../../utils/date.ts';
import KitchenTicketAction from './KitchenTicketAction';
import type { KitchenTicketData } from '../../utils/kitchenTicket';
import { usePermissions } from '../../contexts/PermissionContext';

interface SaleProduct {
  productId: string;
  productName: string;
  productCode?: string;
  variation: string | null;
  batch: string | null;
  qty: number;
  price: number;
  discount: number;
  discountType: 'fixed' | 'percentage';
  tax: number;
  subtotal: number;
}

interface SalePayment {
  date: string;
  reference?: string;
  paymentType: 'cash' | 'card' | 'bankTransfer';
  amount: number;
}

interface SpecialOfferData {
  _id: string;
  offerName: string;
  percentage: number;
}

interface SaleData {
  saleType?: 'pos' | 'non-pos';
  kitchenTicket?: KitchenTicketData;
  _id: string;
  invoiceId?: string;
  warehouseId: {
    _id: string;
    name: string;
  };
  customerId: {
    _id: string;
    name: string;
    mobile: string;
    address?: string;
    email?: string;
  };
  date: string;
  businessType: 'retail' | 'restaurant';
  status: string;
  paymentStatus: string;
  products: SaleProduct[];
  saleDiscountValue: number;
  saleDiscountType: 'fixed' | 'percentage';
  saleTaxValue: number;
  shippingCost: number;
  total: number;
  balance: number;
  cashAmount: number;
  cardAmount: number;
  bankTransferAmount: number;
  cashTendered?: number;
  changeAmount?: number;
  payments?: SalePayment[];
  specialOfferId?: SpecialOfferData | string | null;
  createdAt: string;
}

interface CompanySettings {
  companyName: string;
  defaultEmail: string;
  companyMobile: string;
  address: string;
  city?: string;
  country?: string;
  postalCode?: string;
}

const SaleInvoice: React.FC = () => {
  const { isDemo } = usePermissions();
  const { companyName } = useBranding();
  const { currencySymbol } = useCurrency();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sale, setSale] = useState<SaleData | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);

  useEffect(() => {
    if (id) {
      fetchSale();
      fetchCompanySettings();
    }
  }, [id]);

  const fetchSale = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await getSaleById(id);
      if (result.status === 'success' && result.data) {
        setSale(result.data);
      }
    } catch (error: any) {
      showErrorToast(error.message || 'Failed to fetch sale');
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanySettings = async () => {
    try {
      const response = await settingService.getSettings();
      if (response.success && response.data?.system) {
        setCompanySettings(response.data.system);
      }
    } catch (error) {
      console.error('Failed to load company settings');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'received':
        return 'bg-secondary-soft text-secondary';
      case 'draft':
        return 'bg-surface-muted text-foreground';
      case 'cancelled':
        return 'bg-danger-soft text-danger';
      case 'returned':
        return 'bg-warning-soft text-warning';
      default:
        return 'bg-surface-muted text-foreground';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'bg-secondary-soft text-secondary';
      case 'partial':
        return 'bg-warning-soft text-warning';
      case 'unpaid':
        return 'bg-danger-soft text-danger';
      default:
        return 'bg-surface-muted text-foreground';
    }
  };

  const formatPaymentType = (type: string) => {
    if (type === 'bankTransfer') return 'Bank Transfer';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const formatCurrency = (amount: number) => {
    return `${currencySymbol} ${amount.toFixed(2).replace('.', ',')}`;
  };

  if (loading) {
    return <Loader text="Loading sale details..." />;
  }

  if (!sale) {
    return <div className="p-6">Sale not found</div>;
  }

  const paymentTotal = sale.cashAmount + sale.cardAmount + sale.bankTransferAmount;
  const subtotal = sale.products.reduce((sum, p) => sum + p.subtotal, 0);
  const specialOffer = sale.specialOfferId && typeof sale.specialOfferId === 'object'
    ? (sale.specialOfferId as SpecialOfferData)
    : null;
  const specialOfferDiscount = specialOffer
    ? (subtotal * specialOffer.percentage) / 100
    : 0;
  const subtotalAfterOffer = Math.max(0, subtotal - specialOfferDiscount);
  const discountAmount = sale.saleDiscountType === 'percentage'
    ? subtotalAfterOffer * sale.saleDiscountValue / 100
    : sale.saleDiscountValue;
  const taxAmount = (subtotalAfterOffer - discountAmount) * sale.saleTaxValue / 100;
  
  // Build payments array if not present
  let payments: SalePayment[] = sale.payments || [];
  if (payments.length === 0 && paymentTotal > 0) {
    const saleDate = sale.date ? new Date(sale.date) : new Date();
    if (sale.cashAmount > 0) {
      payments.push({ date: saleDate.toISOString(), paymentType: 'cash', amount: sale.cashAmount });
    }
    if (sale.cardAmount > 0) {
      payments.push({ date: saleDate.toISOString(), paymentType: 'card', amount: sale.cardAmount });
    }
    if (sale.bankTransferAmount > 0) {
      payments.push({ date: saleDate.toISOString(), paymentType: 'bankTransfer', amount: sale.bankTransferAmount });
    }
  }

  const companyAddress = companySettings 
    ? [companySettings.address, companySettings.city, companySettings.country, companySettings.postalCode].filter(Boolean).join(', ')
    : '';

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="bg-surface border-b border-line px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/viewSales')}
              className="flex items-center justify-center w-10 h-10 text-primary hover:text-primary hover:bg-surface-muted rounded-lg transition"
              title="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-2xl font-bold text-foreground">Sale Details</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {sale.saleType === 'pos' && <KitchenTicketAction ticket={sale.kitchenTicket} />}
            <button
              onClick={() => navigate(`/editSale/${sale._id}`)}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-hover font-medium transition flex items-center gap-2"
            >
              <Edit size={16} />
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-surface rounded-lg border border-line p-8">
          {/* Sale Details Identifier */}
          <div className="text-center mb-8">
            <h2 className="text-xl font-semibold text-foreground">
              Sale Details : {sale.invoiceId || sale._id}
            </h2>
          </div>

          {/* Three Column Info Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* CUSTOMER INFO */}
            <div className="border border-line rounded-lg p-4 bg-surface-raised">
              <h3 className="text-sm font-semibold text-muted mb-4 uppercase">Customer Info</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <User className="text-subtle mt-1" size={18} />
                  <span className="text-foreground">{sale.customerId.name}</span>
                </div>
                {sale.customerId.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="text-subtle mt-1" size={18} />
                    <span className="text-foreground">{sale.customerId.email}</span>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Phone className="text-subtle mt-1" size={18} />
                  <span className="text-foreground">{sale.customerId.mobile}</span>
                </div>
                {sale.customerId.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="text-subtle mt-1" size={18} />
                    <span className="text-foreground">{sale.customerId.address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* COMPANY INFO */}
            <div className="border border-line rounded-lg p-4 bg-surface-raised">
              <h3 className="text-sm font-semibold text-muted mb-4 uppercase">Company Info</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Building2 className="text-subtle mt-1" size={18} />
                  <span className="text-foreground">{companyName}</span>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="text-subtle mt-1" size={18} />
                  <span className="text-foreground">{isDemo ? 'Hidden in public demo' : companySettings?.defaultEmail || 'support@infypos.com'}</span>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="text-subtle mt-1" size={18} />
                  <span className="text-foreground">{isDemo ? 'Hidden in public demo' : companySettings?.companyMobile || '1234567890'}</span>
                </div>
                {companyAddress && (
                  <div className="flex items-start gap-3">
                    <MapPin className="text-subtle mt-1" size={18} />
                    <span className="text-foreground">{companyAddress}</span>
                  </div>
                )}
              </div>
            </div>

            {/* INVOICE INFO */}
            <div className="border border-line rounded-lg p-4 bg-surface-raised">
              <h3 className="text-sm font-semibold text-muted mb-4 uppercase">Invoice Info</h3>
              <div className="space-y-3">
                <div>
                  <span className="text-muted text-sm">Reference : </span>
                  <span className="text-foreground font-medium">{sale.invoiceId || sale._id}</span>
                </div>
                <div>
                  <span className="text-muted text-sm">Status : </span>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(sale.status)}`}>
                    {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
                  </span>
                </div>
                <div>
                  <span className="text-muted text-sm">Warehouse : </span>
                  <span className="text-foreground">{sale.warehouseId.name}</span>
                </div>
                <div>
                  <span className="text-muted text-sm">Payment Status : </span>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getPaymentStatusColor(sale.paymentStatus)}`}>
                    {sale.paymentStatus.charAt(0).toUpperCase() + sale.paymentStatus.slice(1)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ORDER SUMMARY and PAYMENT DETAILS Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ORDER SUMMARY - Takes 2 columns */}
            <div className="lg:col-span-2">
              <h3 className="text-lg font-semibold text-foreground mb-4">Order Summary</h3>
              <div className="border border-line rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase">Product</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-foreground uppercase">Net Unit Price</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-foreground uppercase">Quantity</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-foreground uppercase">Unit Price</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-foreground uppercase">Discount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-foreground uppercase">Tax</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-foreground uppercase">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {sale.products.map((product, index) => {
                      const netUnitPrice = product.price;
                      const unitPrice = product.price;
                      
                      return (
                        <tr key={index} className="hover:bg-surface-raised">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-foreground">{product.productName}</div>
                            {product.productCode && (
                              <div className="text-xs text-muted">({product.productCode})</div>
                            )}
                            {product.variation && (
                              <div className="text-xs text-muted">Variation: {product.variation}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-foreground">{formatCurrency(netUnitPrice)}</td>
                          <td className="px-4 py-3 text-right text-sm text-foreground">{product.qty}</td>
                          <td className="px-4 py-3 text-right text-sm text-foreground">{formatCurrency(unitPrice)}</td>
                          <td className="px-4 py-3 text-right text-sm text-foreground">
                            {product.discount > 0 ? `${product.discount}${product.discountType === 'percentage' ? '%' : ''}` : '0.0'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-foreground">
                            {product.tax > 0 ? `${product.tax}%` : '0.0'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-foreground">{formatCurrency(product.subtotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PAYMENT DETAILS and SUMMARY - Takes 1 column */}
            <div className="space-y-6">
              {/* PAYMENT DETAILS */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Payment Details</h3>
                <div className="border border-line rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-surface-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase">Reference</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase">Payment Type</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-foreground uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {payments.length > 0 ? (
                        payments.map((payment, index) => (
                          <tr key={index} className="hover:bg-surface-raised">
                            <td className="px-4 py-3 text-sm text-foreground">
                              {formatDate(payment.date)}
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">{payment.reference || 'N/A'}</td>
                            <td className="px-4 py-3 text-sm text-foreground">{formatPaymentType(payment.paymentType)}</td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-foreground">{formatCurrency(payment.amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-4 py-4 text-center text-sm text-muted">
                            No payment entries
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary of Charges */}
              <div className="border border-line rounded-lg p-4 bg-surface-raised">
                <h3 className="text-lg font-semibold text-foreground mb-4">Summary of Charges</h3>
                <div className="space-y-2">
                  {specialOfferDiscount > 0 && (
                    <div className="flex justify-between text-sm text-secondary font-semibold">
                      <span>Special Offer ({specialOffer?.offerName} - {specialOffer?.percentage}%):</span>
                      <span>-{formatCurrency(specialOfferDiscount)}</span>
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Discount:</span>
                      <span className="text-foreground">{formatCurrency(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Order Tax:</span>
                    <span className="text-foreground">{formatCurrency(taxAmount)} ({sale.saleTaxValue}%)</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Shipping:</span>
                    <span className="text-foreground">{formatCurrency(sale.shippingCost)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-foreground pt-2 border-t border-line-strong mt-2">
                    <span>Grand Total:</span>
                    <span>{formatCurrency(sale.total)}</span>
                  </div>
                  {typeof sale.cashTendered === 'number' && typeof sale.changeAmount === 'number' && (
                    <>
                      <div className="flex justify-between text-sm"><span>Cash tendered:</span><span>{formatCurrency(sale.cashTendered)}</span></div>
                      <div className="flex justify-between text-sm"><span>Change:</span><span>{formatCurrency(sale.changeAmount)}</span></div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SaleInvoice;
