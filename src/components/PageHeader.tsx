import { useNavigate } from "react-router-dom";
import NookLogo from "./NookLogo";

type PageHeaderProps =
  | { variant?: "logo" }
  | { variant: "back"; title: string; backTo?: string };

export default function PageHeader(props: PageHeaderProps) {
  const navigate = useNavigate();

  if (props.variant === "back") {
    const backTo = props.backTo ?? "/profile";
    return (
      <header className="flex items-center gap-3 px-4 py-4 sm:px-6">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="btn-ghost !px-3 !py-2 text-sm"
          aria-label="Go back"
        >
          ←
        </button>
        <h1 className="flex-1 text-lg font-extrabold text-brown">{props.title}</h1>
      </header>
    );
  }

  return (
    <header className="flex items-center px-4 py-4 sm:px-6">
      <NookLogo size={44} />
    </header>
  );
}
