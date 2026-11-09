// Spec #45, ticket #48: the slices write in one storage transaction. A write error in the second
// slice rolls back the write of the first, as applying a draft of changes needs.
import { describe, expect, it } from "vitest";

import { model } from "./model-test-support.ts";

describe("shared transaction", () => {
  it("rolls back the Topics created in question-bank when the Target write in targets fails", async () => {
    const features = await model();
    const target = await features.targets.create();

    const written = features.storage.transaction(async (transaction) => {
      await features.questionBank.ensureTopics(target.id, ["Kafka"], transaction);
      await features.targets.update(
        target.id,
        {
          name: "Go-разработчик",
          level: "middle",
          tone: "neutral",
          language: "ru",
          status: "active",
          sections: [
            {
              id: crypto.randomUUID(),
              position: 0,
              name: "Брокеры сообщений",
              kind: "topics",
              gradingCriteria: "",
              enabled: true,
              // A Topic of no Target: targets refuses the Section.
              topicIds: [crypto.randomUUID()],
            },
          ],
        },
        transaction,
      );
    });

    await expect(written).rejects.toThrow("A Section must reference only Topics of its own Target");
    await expect(features.questionBank.topics(target.id)).resolves.toStrictEqual([]);
    await expect(features.targets.get(target.id)).resolves.toMatchObject({
      name: "",
      status: "draft",
      sections: [],
    });
  });
});
