import { number } from "@/lib/format";
import { creditCategoryNames } from "../lib/creditTransactionDisplay";

export default function CategoryWalletBalances({ wallet }) {
  return <dl className="grid gap-2 text-xs">
    {Object.entries(creditCategoryNames).map(([category, title]) => {
      const amounts = wallet?.creditBalances?.[category];
      return <div key={category} className="flex justify-between gap-3">
        <dt>{title}</dt><dd className="font-medium tabular-nums">{number(amounts?.available ?? 0)} available</dd>
      </div>;
    })}
  </dl>;
}

