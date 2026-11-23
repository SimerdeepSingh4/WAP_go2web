import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export default function FilteringNumberActions({ numbers, fileName }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(numbers);
      toast.add({ title: "Numbers copied", type: "success" });
    } catch {
      toast.add({ title: "Couldn’t copy the numbers", type: "error" });
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([`${numbers}\n`], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" readOnlySafe disabled={!numbers} onClick={copy}>
        <Copy aria-hidden="true" />Copy
      </Button>
      {fileName && <Button type="button" variant="outline" size="sm" readOnlySafe disabled={!numbers} onClick={download}>
        <Download aria-hidden="true" />Download TXT
      </Button>}
    </div>
  );
}
