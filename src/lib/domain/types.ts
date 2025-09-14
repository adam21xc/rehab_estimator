export type Unit = 'ea' | 'sf' | 'psf' | 'lf' | 'ls';


export interface CatalogItem {
id: string; // slug from form_data_description
description: string;
unit: Unit;
cost: number; // unit cost
}


export interface CatalogCategory {
key: string; // slugified category name
label: string; // original name (e.g. "Roof")
items: CatalogItem[];
}


export interface RehabCatalog {
categories: CatalogCategory[];
}


export interface PhotoRef {
id: string; // nanoid
itemId?: string; // if tied to a line item
categoryKey: string;
fileName: string;
mime: string;
url: string; // object URL or remote URL
takenAt?: string; // ISO
note?: string;
}


export interface LineInput {
itemId: string;
quantity: number; // user input; for 'ls' can be 1..N
note?: string;
}


export interface CategoryProgress {
categoryKey: string;
lines: LineInput[]; // only those with quantity > 0
photos: PhotoRef[];
}


export interface RehabProjectMeta {
id: string; // uuid/slug
address?: string;
createdAt: string; // ISO
updatedAt: string; // ISO
}


export interface RehabProject {
meta: RehabProjectMeta;
catalog: RehabCatalog; // snapshot of catalog used for this project
progress: CategoryProgress[];
}


export interface CalcSubtotal {
categoryKey: string;
subtotal: number;
}


export interface CalcTotals {
byCategory: CalcSubtotal[];
grandTotal: number;
}