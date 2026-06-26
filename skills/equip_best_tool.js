/** Equip the best available tool for an activity. activity: "mining" | "woodcutting" | "combat" | "digging" */
export default async function (skills, args) {
  const ACTIVITY_TOOL = {
    mining: 'pickaxe',
    woodcutting: 'axe',
    combat: 'sword',
    digging: 'shovel',
    farming: 'hoe',
  };
  const activity = args.activity ?? 'mining';
  const toolType = ACTIVITY_TOOL[activity] ?? args.tool_type ?? 'pickaxe';

  // Netherite > Diamond > Iron > Stone > Golden > Wooden
  const TIERS = ['netherite', 'diamond', 'iron', 'stone', 'golden', 'wooden'];
  const bot = skills.bot;

  let equipped = null;
  for (const tier of TIERS) {
    const item = bot.inventory.items().find(i => i.name === `${tier}_${toolType}`);
    if (item) {
      await bot.equip(item, 'hand');
      equipped = item.name;
      skills.log(`Equipped ${equipped}`);
      break;
    }
  }

  if (!equipped) {
    skills.log(`No ${toolType} in inventory`);
  }
  return { equipped, activity };
}
