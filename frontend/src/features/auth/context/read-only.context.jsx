import { createContext } from "react";

// Scoped to dashboard actions. The banner, navigation, and support stay usable.
export const ReadOnlyContext = createContext(null);
