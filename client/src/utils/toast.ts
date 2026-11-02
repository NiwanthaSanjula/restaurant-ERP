import { toast } from 'react-toastify';

const isMobileViewport = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

const baseToastStyle = (accentColor: string) => {
  const isMobile = isMobileViewport();
  return {
    backgroundColor: 'var(--ss-surface)',
    color: 'var(--ss-foreground)',
    borderInlineStart: `4px solid ${accentColor}`,
    width: isMobile ? 'calc(100vw - 1.25rem)' : undefined,
    maxWidth: isMobile ? '21rem' : '28rem',
    margin: isMobile ? '0 auto' : undefined,
    minHeight: isMobile ? '2.4rem' : undefined,
    fontSize: isMobile ? '0.9rem' : '0.9rem',
    lineHeight: 1.35,
    borderRadius: isMobile ? '10px' : '12px',
    padding: isMobile ? '10px 12px' : '10px 12px'
  } as const;
};

export const showSuccessToast = (message: string) => {
  const isMobile = isMobileViewport();
  toast.success(message, {
    position: isMobile ? 'top-center' : 'top-right',
    autoClose: isMobile ? 2600 : 3000,
    hideProgressBar: isMobile,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    style: baseToastStyle('var(--ss-secondary)')
  });
};

export const showErrorToast = (message: string) => {
  const isMobile = isMobileViewport();
  toast.error(message, {
    position: isMobile ? 'top-center' : 'top-right',
    autoClose: isMobile ? 3200 : 5000,
    hideProgressBar: isMobile,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    style: baseToastStyle('var(--ss-danger)')
  });
};

export const showInfoToast = (message: string) => {
  const isMobile = isMobileViewport();
  toast.info(message, {
    position: isMobile ? 'top-center' : 'top-right',
    autoClose: isMobile ? 2200 : 3000,
    hideProgressBar: isMobile,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    style: baseToastStyle('var(--ss-primary)')
  });
};

export const showWarningToast = (message: string) => {
  const isMobile = isMobileViewport();
  toast.warn(message, {
    position: isMobile ? 'top-center' : 'top-right',
    autoClose: isMobile ? 3800 : 6000,
    hideProgressBar: isMobile,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    style: baseToastStyle('var(--ss-warning)')
  });
};
