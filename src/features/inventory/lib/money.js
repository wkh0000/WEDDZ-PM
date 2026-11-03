const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const SCALES = [[1e12, 'Trillion'], [1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']]

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** 1234.5 → "1,234.50" */
export function formatAmount(n) {
  return round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 1234.5 → "Rs. 1,234.50" */
export function formatRs(n) {
  return `Rs. ${formatAmount(n)}`
}

function under1000(n) {
  const parts = []
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100 }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '')) }
  else if (n > 0) parts.push(ONES[n])
  return parts.join(' ')
}

export function integerInWords(n) {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'Zero'
  const parts = []
  for (const [value, name] of SCALES) {
    if (n >= value) { parts.push(`${integerInWords(Math.floor(n / value))} ${name}`); n %= value }
  }
  if (n > 0) parts.push(under1000(n))
  return parts.join(' ')
}

/** 1816450 → "Sri Lankan Rupees One Million Eight Hundred Sixteen Thousand Four Hundred Fifty Only" */
export function amountInWords(amount) {
  const cents = Math.round(round2(amount) * 100)
  const rupees = Math.floor(cents / 100)
  const rest = cents % 100
  let words = `Sri Lankan Rupees ${integerInWords(rupees)}`
  if (rest) words += ` and Cents ${integerInWords(rest)}`
  return `${words} Only`
}
