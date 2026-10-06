# Tide Town

A traveler reaches a seaside town, meeting dock guard A Gang and ferryman Old Du. They belong to the same dock NPC group but have separate small-talk lines about wind and cargo rather than explaining the main plot. A Gang knows that the north bridge is damaged; Old Du does not. Their small talk must not reveal the secret.

The traveler visits healer Lin Qiu at the clinic. She and A Gang are town colleagues. She asks whether the traveler wants rest or treatment. The player can leave, while treatment is available only if injured. Treatment clears injury and adds 1 trust; she advises taking it easy. A bandage reminder note is available at the clinic.

A dock alarm makes A Gang inspect the ferry and raises dock alert. Demonstration minute ticks: arrival 0, clinic phase 5, alarm 10, departure 12. The healer appears at the clinic from 5–12; both dock NPCs appear from 0–12. One level, two scenes. Clinic dialogue opens with the greeting even when the player is injured; injury unlocks the choice rather than skipping directly to treatment.

This example explicitly requests 1 short small-talk card per dock NPC and 2 healer cards (greeting and treatment): 3 dialogue graphs containing 4 cards in total, each body no longer than 120 Unicode characters. Player choices are not cards, and leaving ends the conversation directly. This is not a request for two sentences per NPC. The dock group members remain separate characters; canvas order does not determine narrative order.
