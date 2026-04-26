export type LoanInputs = {
  homePrice: number;
  downPaymentPct: number;
  interestRatePct: number;
  loanTermYears: number;
  annualPropertyTax: number;
  annualInsurance: number;
  monthlyHoa: number;
  pmiRatePct: number;
};

export type LoanBreakdown = {
  loanAmount: number;
  downPayment: number;
  monthlyPrincipalAndInterest: number;
  monthlyTax: number;
  monthlyInsurance: number;
  monthlyHoa: number;
  monthlyPmi: number;
  pmiRequired: boolean;
  monthlyTotal: number;
  totalInterest: number;
  totalOfPayments: number;
};

export function calculateMortgage(inputs: LoanInputs): LoanBreakdown {
  const downPayment = inputs.homePrice * (inputs.downPaymentPct / 100);
  const loanAmount = Math.max(0, inputs.homePrice - downPayment);
  const monthlyRate = inputs.interestRatePct / 100 / 12;
  const n = inputs.loanTermYears * 12;

  let monthlyPI = 0;
  if (loanAmount > 0 && n > 0) {
    if (monthlyRate === 0) {
      monthlyPI = loanAmount / n;
    } else {
      monthlyPI =
        (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, n)) /
        (Math.pow(1 + monthlyRate, n) - 1);
    }
  }

  const pmiRequired = inputs.downPaymentPct < 20 && loanAmount > 0;
  const monthlyPmi = pmiRequired
    ? (loanAmount * (inputs.pmiRatePct / 100)) / 12
    : 0;

  const monthlyTax = inputs.annualPropertyTax / 12;
  const monthlyInsurance = inputs.annualInsurance / 12;
  const monthlyHoa = inputs.monthlyHoa;
  const monthlyTotal =
    monthlyPI + monthlyTax + monthlyInsurance + monthlyHoa + monthlyPmi;
  const totalOfPayments = monthlyPI * n;
  const totalInterest = totalOfPayments - loanAmount;

  return {
    loanAmount,
    downPayment,
    monthlyPrincipalAndInterest: monthlyPI,
    monthlyTax,
    monthlyInsurance,
    monthlyHoa,
    monthlyPmi,
    pmiRequired,
    monthlyTotal,
    totalInterest,
    totalOfPayments,
  };
}

export function estimatedAnnualInsurance(homePrice: number): number {
  return homePrice * 0.0035;
}

export function formatCurrency(n: number): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatCurrencyCents(n: number): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
