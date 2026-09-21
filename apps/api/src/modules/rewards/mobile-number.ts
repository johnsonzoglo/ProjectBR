import { z } from "zod";
export const mobileNumberSchema = z.string().trim().max(32).transform(value => value.replace(/[\s()-]/g, "")).pipe(z.string().regex(/^(?:\+[1-9][0-9]{6,14}|[0-9]{7,15})$/, "Enter a valid mobile number; country code is optional")).optional();
