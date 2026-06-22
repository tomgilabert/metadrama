import { defineCollection, z } from "astro:content";

const pages = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    date: z.string(),
    modified: z.string().optional(),
    parent: z.string().optional(),
    featuredImage: z.string().optional(),
    featuredMediaId: z.number().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { pages };
