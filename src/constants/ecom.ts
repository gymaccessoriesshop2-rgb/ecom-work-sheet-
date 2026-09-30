export interface EcomCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export interface EcomPlatform {
  id: string;
  label: string;
  icon: string;
}

export const ECOM_CATEGORIES: EcomCategory[] = [
  { id: 'Product Hunting', label: 'Product Hunting', icon: '🔍', color: '#38bdf8' },
  { id: 'Listing & SEO', label: 'Listing & SEO', icon: '✍️', color: '#c084fc' },
  { id: 'Creatives & Media', label: 'Creatives & Ads', icon: '🎬', color: '#f472b6' },
  { id: 'PPC & Ads', label: 'Meta / TikTok PPC', icon: '🚀', color: '#fbbf24' },
  { id: 'Orders & Support', label: 'Orders & Support', icon: '📦', color: '#34d399' },
  { id: 'Supplier & Inventory', label: 'Supplier & Stock', icon: '🏭', color: '#818cf8' },
  { id: 'Store Tech & CRO', label: 'Store Tech & CRO', icon: '💻', color: '#2dd4bf' },
  { id: 'Daily Accounts', label: 'Daily Accounts', icon: '📊', color: '#a3e635' },
];

export const ECOM_PLATFORMS: EcomPlatform[] = [
  { id: 'Shopify', label: 'Shopify Store', icon: '🛍️' },
  { id: 'Amazon', label: 'Amazon FBA/FBM', icon: '📦' },
  { id: 'TikTok Shop', label: 'TikTok Shop', icon: '🎵' },
  { id: 'Walmart', label: 'Walmart', icon: '🏪' },
  { id: 'General', label: 'General / Multi-store', icon: '🌐' },
];
