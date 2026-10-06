import {
  LLX_UTILITY,
  LLX_UTILITY_NOTE,
  utilityStatusLabel,
} from "@/lib/llxUtility";

export function LlxUtility() {
  return (
    <div>
      <ol className="utility">
        {LLX_UTILITY.map((item) => (
          <li key={item.id}>
            <span
              className={`pill ${item.status === "live" ? "live" : "soon"}`}
            >
              {utilityStatusLabel(item.status)}
            </span>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
          </li>
        ))}
      </ol>
      <p className="note">{LLX_UTILITY_NOTE}</p>
    </div>
  );
}
