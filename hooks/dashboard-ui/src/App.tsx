import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { ProjectProvider } from "./data/ProjectContext";
import { router } from "./routes";

export default function App() {
  return (
    <ProjectProvider>
      <RouterProvider router={router} />
      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: "#1e1e1e",
            border: "1px solid #2a2a2a",
            color: "#c8c4bc",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "0.75rem",
          },
        }}
      />
    </ProjectProvider>
  );
}
