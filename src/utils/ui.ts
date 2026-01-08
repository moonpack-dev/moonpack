import * as p from '@clack/prompts';

export interface Spinner {
  start(message: string): void;
  stop(message?: string): void;
  message(text: string): void;
}

export interface TextOptions {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string) => string | undefined;
}

export interface SelectOption<T> {
  value: T;
  label: string;
  hint?: string;
}

export interface SelectOptions<T> {
  message: string;
  options: SelectOption<T>[];
  initialValue?: T;
}

export interface ConfirmOptions {
  message: string;
  initialValue?: boolean;
}

export function intro(title: string): void {
  p.intro(title);
}

export function outro(message: string): void {
  p.outro(message);
}

export function cancel(message: string): void {
  p.cancel(message);
}

export function createSpinner(): Spinner {
  const spinner = p.spinner();
  return {
    start(message: string): void {
      spinner.start(message);
    },
    stop(message?: string): void {
      spinner.stop(message);
    },
    message(text: string): void {
      spinner.message(text);
    },
  };
}

export function info(message: string): void {
  p.log.info(message);
}

export function warn(message: string): void {
  p.log.warn(message);
}

export function error(message: string): void {
  p.log.error(message);
}

export function success(message: string): void {
  p.log.success(message);
}

export function step(message: string): void {
  p.log.step(message);
}

export function message(text: string): void {
  p.log.message(text);
}

export function note(message: string, title?: string): void {
  p.note(message, title);
}

export function isCancel(value: unknown): value is symbol {
  return p.isCancel(value);
}

export async function text(options: TextOptions): Promise<string | symbol> {
  const opts: Parameters<typeof p.text>[0] = { message: options.message };
  if (options.placeholder !== undefined) opts.placeholder = options.placeholder;
  if (options.defaultValue !== undefined) opts.defaultValue = options.defaultValue;
  if (options.validate !== undefined) opts.validate = options.validate;
  return p.text(opts);
}

export async function select<T>(options: SelectOptions<T>): Promise<T | symbol> {
  const opts: Parameters<typeof p.select>[0] = {
    message: options.message,
    options: options.options.map((o) => ({
      value: o.value,
      label: o.label,
      ...(o.hint !== undefined && { hint: o.hint }),
    })),
  };
  if (options.initialValue !== undefined) opts.initialValue = options.initialValue;
  return p.select(opts) as Promise<T | symbol>;
}

export async function confirm(options: ConfirmOptions): Promise<boolean | symbol> {
  const opts: Parameters<typeof p.confirm>[0] = { message: options.message };
  if (options.initialValue !== undefined) opts.initialValue = options.initialValue;
  return p.confirm(opts);
}
