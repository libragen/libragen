/**
 * Sample utility functions for testing chunking and embedding
 */

/**
 * Calculate the factorial of a number
 * @param n - The number to calculate factorial for
 * @returns The factorial of n
 */
export function factorial(n: number): number {
   if (n < 0) {
      throw new Error('Factorial is not defined for negative numbers');
   }
   if (n === 0 || n === 1) {
      return 1;
   }
   return n * factorial(n - 1);
}

/**
 * Check if a number is prime
 * @param n - The number to check
 * @returns True if the number is prime
 */
export function isPrime(n: number): boolean {
   if (n <= 1) {
      return false;
   }
   if (n <= 3) {
      return true;
   }
   if (n % 2 === 0 || n % 3 === 0) {
      return false;
   }
   for (let i = 5; i * i <= n; i += 6) {
      if (n % i === 0 || n % (i + 2) === 0) {
         return false;
      }
   }
   return true;
}

/**
 * Generate Fibonacci sequence up to n terms
 * @param n - Number of terms to generate
 * @returns Array of Fibonacci numbers
 */
export function fibonacci(n: number): number[] {
   if (n <= 0) {
      return [];
   }
   if (n === 1) {
      return [ 0 ];
   }

   const result = [ 0, 1 ];

   for (let i = 2; i < n; i++) {
      result.push(result[i - 1] + result[i - 2]);
   }

   return result;
}

/**
 * Deep clone an object using JSON serialization
 * @param obj - Object to clone
 * @returns Deep cloned object
 */
export function deepClone<T>(obj: T): T {
   return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce a function call
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends(...args: unknown[]) => unknown>(
   fn: T,
   delay: number
): (...args: Parameters<T>) => void {
   let timeoutId: ReturnType<typeof setTimeout> | null = null;

   return (...args: Parameters<T>) => {
      if (timeoutId) {
         clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
         fn(...args);
      }, delay);
   };
}
