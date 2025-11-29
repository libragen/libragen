# Sample Project

This is a sample project for testing the libragen chunking and embedding pipeline.

## Installation

```bash
npm install sample-project
```

## Usage

### Basic Example

```typescript
import { factorial, isPrime, fibonacci } from 'sample-project';

// Calculate factorial
const fact5 = factorial(5); // 120

// Check if prime
const is7Prime = isPrime(7); // true

// Generate Fibonacci sequence
const fib10 = fibonacci(10); // [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
```

### Advanced Usage

The library also provides utility functions for common operations:

```typescript
import { deepClone, debounce } from 'sample-project';

// Deep clone objects
const original = { nested: { value: 42 } };
const cloned = deepClone(original);

// Debounce function calls
const debouncedSave = debounce(saveData, 300);
```

## API Reference

### `factorial(n: number): number`

Calculates the factorial of a non-negative integer.

- **Parameters**: `n` - A non-negative integer
- **Returns**: The factorial of n
- **Throws**: Error if n is negative

### `isPrime(n: number): boolean`

Determines if a number is prime.

- **Parameters**: `n` - An integer to check
- **Returns**: `true` if the number is prime, `false` otherwise

### `fibonacci(n: number): number[]`

Generates the first n numbers in the Fibonacci sequence.

- **Parameters**: `n` - Number of terms to generate
- **Returns**: Array of Fibonacci numbers

### `deepClone<T>(obj: T): T`

Creates a deep copy of an object using JSON serialization.

- **Parameters**: `obj` - Object to clone
- **Returns**: Deep cloned copy of the object
- **Note**: Does not work with functions, undefined, or circular references

### `debounce(fn, delay): Function`

Creates a debounced version of a function that delays execution.

- **Parameters**:
  - `fn` - Function to debounce
  - `delay` - Delay in milliseconds
- **Returns**: Debounced function

## License

MIT
