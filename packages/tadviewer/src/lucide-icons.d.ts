// Lucide's per-icon modules (lucide-react/icons/<name>), which TypeScript's
// "node" module resolution doesn't find through the package's exports map.
// Importing icons one at a time keeps the rest of Lucide out of the bundle:
// importing from "lucide-react" would bundle every icon, as tadviewer is
// compiled to CommonJS.
declare module "lucide-react/icons/*" {
  const Icon: import("lucide-react").LucideIcon;
  export default Icon;
}
