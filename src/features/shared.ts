import "server-only";
import { z } from "zod";
import { AppError, failure, type ActionResult } from "@/lib/errors";
import { fieldErrors } from "@/lib/validation/common";
import { formDataToObject } from "@/lib/utils";

/** Parses FormData with a zod schema, throwing an AppError carrying field errors. */
export function parseForm<T extends z.ZodTypeAny>(schema: T, formData: FormData | Record<string, unknown>): z.infer<T> {
  const raw = formData instanceof FormData ? formDataToObject(formData) : formData;
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError("Please correct the highlighted fields.", 422, fieldErrors(result.error));
  }
  return result.data;
}

/** Wraps a server action body with centralised error handling. */
export async function runAction<T>(context: string, fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    // Next.js uses thrown errors for redirect()/notFound(); let those propagate.
    if (error && typeof error === "object" && "digest" in error && typeof (error as { digest: unknown }).digest === "string"
        && ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT") || (error as { digest: string }).digest.startsWith("NEXT_NOT_FOUND"))) {
      throw error;
    }
    return failure(error, context);
  }
}

/** Throws the Supabase error so runAction maps it; returns data otherwise. */
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  // PostgREST returns null data for mutations without a select; callers that read rows always
  // use .select(), so an empty array is the correct "nothing matched" value.
  return (res.data ?? []) as T;
}

export function nullable<T>(v: T | undefined): T | null {
  return v === undefined ? null : v;
}
