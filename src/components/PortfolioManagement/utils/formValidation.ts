export function validateQuantity(value: string): boolean {
  return value === "" || /^\d+$/.test(value);
}

export function validatePrice(value: string): boolean {
  return value === "" || /^\d*\.?\d*$/.test(value);
}

export function parseQuantity(value: string): number {
  return value.trim() === "" ? 0 : parseInt(value) || 0;
}

export function parsePrice(value: string): number {
  return value.trim() === "" ? 0 : parseFloat(value) || 0;
}
