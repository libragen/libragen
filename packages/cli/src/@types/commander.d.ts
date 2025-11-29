/**
 * Type declarations for commander
 *
 * Commander v9+ has issues with NodeNext module resolution.
 * This provides the necessary type declarations.
 */

declare module 'commander' {
   import { Command as CommandClass, Option, Argument, Help, CommanderError, InvalidArgumentError } from 'commander/typings/index.js';

   export { CommandClass as Command, Option, Argument, Help, CommanderError, InvalidArgumentError };
   export const program: CommandClass;
   export function createCommand(name?: string): CommandClass;
   export function createOption(flags: string, description?: string): Option;
   export function createArgument(name: string, description?: string): Argument;
}
