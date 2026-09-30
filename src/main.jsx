import { supabase } from "./supabaseClient";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "../LoanSystem-1.jsx";

createRoot(document.getElementById("root")).render(
  <App />
);
