import { z } from 'zod';


export const unitZ = z.enum(['ea','sf','psf','lf','ls']);


export const catalogItemZ = z.object({
id: z.string(),
description: z.string(),
unit: unitZ,
cost: z.number().nonnegative(),
});


export const catalogCategoryZ = z.object({
key: z.string(),
label: z.string(),
items: z.array(catalogItemZ),
});


export const rehabCatalogZ = z.object({
categories: z.array(catalogCategoryZ)
});


export const lineInputZ = z.object({
itemId: z.string(),
quantity: z.number().min(0),
note: z.string().optional(),
});


export const photoRefZ = z.object({
id: z.string(),
itemId: z.string().optional(),
categoryKey: z.string(),
fileName: z.string(),
mime: z.string(),
url: z.string().url(),
takenAt: z.string().datetime().optional(),
note: z.string().optional(),
});


export const categoryProgressZ = z.object({
categoryKey: z.string(),
lines: z.array(lineInputZ),
photos: z.array(photoRefZ),
});


export const rehabProjectZ = z.object({
meta: z.object({
id: z.string(),
address: z.string().optional(),
createdAt: z.string().datetime(),
updatedAt: z.string().datetime(),
}),
catalog: rehabCatalogZ,
progress: z.array(categoryProgressZ),
});


export type RehabCatalog = z.infer<typeof rehabCatalogZ>;