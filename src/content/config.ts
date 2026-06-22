import { defineCollection, z } from "astro:content";

const pages = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    date: z.union([z.string(), z.coerce.date()]).transform((v) =>
      typeof v === "string" ? v : v.toISOString()
    ),
    modified: z.union([z.string(), z.coerce.date()]).optional().transform((v) =>
      v === undefined ? undefined : typeof v === "string" ? v : v.toISOString()
    ),
    parent: z.string().optional(),
    featuredImage: z.string().optional(),
    featuredMediaId: z.number().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { pages };
