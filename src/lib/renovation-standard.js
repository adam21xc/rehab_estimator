// Shared by Design Studio and the OAuth renovation pipeline.
export const RENOVATION_MODEL = 'gpt-image-2.5-sunburst';
export const RENOVATION_STYLE = 'Modern warm';
export const RENOVATION_REQUEST =
	'Give this property a fresh, inviting remodel with cohesive colors, attractive finishes, and practical upgrades. Preserve the viewpoint and existing structure.';

/** @param {string} [style] @param {string} [requestedChanges] */
export function renovationPrompt(style = RENOVATION_STYLE, requestedChanges = RENOVATION_REQUEST) {
	return `Create a photorealistic remodel concept from this property photo. Preserve the camera viewpoint, room dimensions, walls, windows, doors and structural layout unless the requested changes explicitly say otherwise. Show plausible materials and lighting. Do not add text or watermarks. Style: ${style}. If asked to suggest a direction, choose a cohesive, practical renovation suitable for this space. Requested changes: ${requestedChanges}`;
}
