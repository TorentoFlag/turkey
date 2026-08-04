export interface SiteConfig {
  technicalProjectName: string;
  publicBrandName: string | null;
  defaultLocale: string;
  supportedLocales: string[];
  defaultCurrency: string;
  supportedCurrencies: string[];
  legalCompanyName: string | null;
  taxId: string | null;
  legalAddress: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  supportHours: string | null;
  socialLinks: string[];
  legalLinks: string[];
  paymentMethods: string[];
  minimumProductPrice: number;
  primaryMarket: string;
  primaryReference: string;
  nomenclatureReference: string;
  description: string;
}
