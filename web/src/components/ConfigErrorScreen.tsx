"use client";

type ConfigErrorScreenProps = {
  title: string;
  description: string;
  errors: string[];
  compact?: boolean;
};

export function ConfigErrorPanel({
  title,
  description,
  errors,
}: Omit<ConfigErrorScreenProps, "compact">) {
  return (
    <div className="rounded-[20px] border border-[#4c1d24] bg-[linear-gradient(180deg,#160b0d_0%,#0f090a_100%)] p-5 text-[#f7f4ef]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f2b6be]">
        Configuration required
      </div>
      <div className="mt-3 text-[22px] font-semibold tracking-[-0.04em]">{title}</div>
      <p className="mt-3 text-sm leading-7 text-[#e6c7cb]">{description}</p>
      <div className="mt-4 rounded-[16px] border border-[#3a1d22] bg-[#12090b] p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f2b6be]">
          Missing or invalid runtime values
        </div>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[#f7d9dd]">
          {errors.map((error) => (
            <li key={error} className="break-words">
              {error}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ConfigErrorScreen({
  title,
  description,
  errors,
}: ConfigErrorScreenProps) {
  return (
    <main className="min-h-screen bg-[#070707] px-4 py-5 text-[#f7f4ef]">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[420px] flex-col justify-center">
        <ConfigErrorPanel title={title} description={description} errors={errors} />
      </div>
    </main>
  );
}
