/**
 * The GymFlow AI design system.
 *
 * Import everything from here:
 *
 *     import { Card, StatCard, Button, color, space } from '@/design';
 *
 * The layers, and what belongs in each:
 *
 *   tokens      colour, spacing, radius, type, elevation, motion
 *   primitives  Text, Stack, Row, Surface, Card, Screen, Body, Section
 *   controls    Button, Badge, Input, ProgressBar, MetricRow
 *   cards       StatCard, SessionCard, ProgressCard, AlertCard, Banner
 *   feedback    Loading, Skeleton, EmptyState, ErrorState, OfflineNotice
 *   motion      press springs, staggered entrances, counting numbers
 *   navigation  tab bar options, Segmented
 *   brand       SlamLogo, SlamMark, BrandHeader, Avatar, DemoTag
 *
 * When a screen needs something this does not provide, extend the layer it
 * belongs to rather than styling in place — one-off styles are how a design
 * system stops being one.
 *
 * `src/theme` remains as a compatibility view over these tokens for the screens
 * written against the earlier shape. New work should import from here.
 */

export * from './tokens';
export * from './primitives';
export * from './controls';
export * from './cards';
export * from './feedback';
export * from './motion';
export * from './navigation';
export * from './brand';

export { default as tokens } from './tokens';
