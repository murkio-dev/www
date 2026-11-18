// Preços chegam em centavos (contrato de GET /v1/payments/plans).
export function amount(cents: number): string {
    return (cents / 100).toFixed(2).replace(".", ",");
}

export function money(symbol: string, cents: number): string {
    return symbol + " " + amount(cents);
}

// `discount` é uma porcentagem (0 a 100) aplicada sobre `price`, em centavos.
export function finalPrice(price: number, discount: number): number {
    return Math.round(price * (100 - discount) / 100);
}
