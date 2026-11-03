// src/features/user/pages/CreateActivity.jsx
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/features/admin/components/shared";
import { useUserMutation } from "../hooks/useUser";
import { toast } from "@/components/ui/toast";

/**
 * UI for creating a new activity within a campaign.
 * Collects five primary fields and sends them via the `createCampaign` mutation
 * (or a dedicated activity endpoint if available). Here we reuse `createCampaign`
 * as a placeholder for demonstration.
 */
export default function CreateActivity() {
  const [form, setForm] = useState({
    name: "",
    type: "Task",
    date: "",
    budget: "",
    description: "",
  });

  // Placeholder mutation – you may replace "createCampaign" with an actual activity endpoint.
  const { mutate: createActivity, isLoading } = useUserMutation(
    "createCampaign",
    "Activity created successfully",
    null
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { name, date, budget } = form;
    if (!name || !date || !budget) {
      toast.add({ title: "Please fill required fields", type: "error" });
      return;
    }
    // Send form data – adapt payload as needed by backend.
    createActivity(form);
  };

  return (
    <>
      <PageHeading
        title="Create Activity"
        description="Add a new activity to your campaign. Front‑end validation only."
      />
      <Card className="max-w-2xl mx-auto mt-8">
        <CardHeader>
          <CardTitle>New Activity Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Activity Name *</label>
              <Input name="name" value={form.name} onChange={handleChange} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full rounded-md border border-gray-300 p-2 focus:outline-none"
              >
                <option value="Task">Task</option>
                <option value="Event">Event</option>
                <option value="Milestone">Milestone</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Scheduled Date *</label>
              <Input type="date" name="date" value={form.date} onChange={handleChange} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Budget ($) *</label>
              <Input
                type="number"
                name="budget"
                value={form.budget}
                onChange={handleChange}
                min="0"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Textarea name="description" value={form.description} onChange={handleChange} rows={4} />
            </div>
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? "Creating…" : "Create Activity"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
