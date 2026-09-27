import catalogue from '../assets/furniture/models.json' with { type: 'json' };
export const FURNITURE = catalogue.items;

export { furnitureInteraction } from './furniture-rules.js';
