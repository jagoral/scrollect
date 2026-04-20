import { createScorer } from "evalite";

import { castTypeData, computeStructuralScore } from "../../src/drafting/logic/postDraftGeneration";
export const structuralValidity = createScorer<any, any, any>({
  name: "Structural Validity",
  description: "Validates post structure using castTypeData and computeStructuralScore",
  scorer: ({ output }) => {
    try {
      castTypeData(output.postType, output.typeData);
      return computeStructuralScore({
        postType: output.postType,
        typeData: output.typeData,
      });
    } catch {
      return 0;
    }
  },
});
