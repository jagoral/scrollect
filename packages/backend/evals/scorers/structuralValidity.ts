import { createScorer } from "evalite";

import { castTypeData, computeStructuralScore } from "../../src/pipeline/logic/cardDraftGeneration";
export const structuralValidity = createScorer<any, any, any>({
  name: "Structural Validity",
  description: "Validates card structure using castTypeData and computeStructuralScore",
  scorer: ({ output }) => {
    try {
      castTypeData(output.cardType, output.typeData);
      return computeStructuralScore({
        cardType: output.cardType,
        typeData: output.typeData,
      });
    } catch {
      return 0;
    }
  },
});
