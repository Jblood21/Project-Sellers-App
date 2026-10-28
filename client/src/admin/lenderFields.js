/** The lender facts the back of the flyer prints. The agent fills these in; they save to the listing's lender settings. */
export const LENDER_FIELDS = [
  { key: 'lenderName', label: 'Lender or company name' },
  { key: 'lenderNmls', label: 'Company NMLS ID', inputMode: 'numeric' },
  { key: 'loName', label: 'Loan officer name' },
  { key: 'loNmls', label: 'Loan officer NMLS ID', inputMode: 'numeric' },
  { key: 'lenderPhone', label: 'Phone', inputMode: 'tel' },
  { key: 'lenderEmail', label: 'Email', inputMode: 'email' },
  { key: 'lenderWebsite', label: 'Website', inputMode: 'url', placeholder: 'https://…' },
  { key: 'lenderAddress', label: 'Office address' },
  { key: 'loanApplicationUrl', label: 'Loan application link', inputMode: 'url', placeholder: 'https://…' },
];
