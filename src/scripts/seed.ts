/**
 * Seeds ~10 realistic upcoming community events around Dhaka.
 * Safe to run repeatedly: events are upserted by title for the seed creator,
 * and dates are refreshed relative to "now" so they always stay upcoming.
 *
 *   npm run seed
 */
import { getDb, closeDb } from "../db/client.js";
import type { EventDoc } from "../types/models.js";
import type { EventType } from "../validators/event.validator.js";

const SEED_CREATOR = { email: "volunteers@hateyhat.org", name: "Hatey Hat Volunteer Desk" };

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

/** Returns a Date `days` from now at the given local hour (Asia/Dhaka, UTC+6). */
function daysFromNow(days: number, hourDhaka: number, minute = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hourDhaka - 6, minute, 0, 0);
  return date;
}

type SeedEvent = Omit<EventDoc, "_id" | "creatorEmail" | "creatorName" | "createdAt" | "updatedAt"> & {
  eventType: EventType;
};

const seedEvents: SeedEvent[] = [
  {
    title: "Winter Clothes Distribution – Mirpur 10",
    description:
      "As the cold sets in, families living along the Mirpur 10 rail line struggle through the night without warm clothing. We will distribute sorted sweaters, shawls and children's jackets collected from donors across the city. Volunteers will help with sorting at 8 AM, then work in small teams to hand out clothes directly to families. Please wear comfortable shoes and bring a water bottle.",
    eventType: "Donation",
    thumbnail: img("photo-1488521787991-ed7bbaae773c"),
    location: "Mirpur 10 Circle, Dhaka",
    eventDate: daysFromNow(4, 8),
  },
  {
    title: "Blanket Distribution for the Needy – Mohammadpur",
    description:
      "Together with local mosque committees and youth clubs, we are handing out 500 thick blankets to elderly people, day labourers and street-dwelling families around Mohammadpur Town Hall and Beribadh. Volunteers will verify lists, keep queues orderly and help carry blankets to people who cannot walk to the distribution point.",
    eventType: "Donation",
    thumbnail: img("photo-1469571486292-0ba58a3f068b"),
    location: "Mohammadpur Town Hall, Dhaka",
    eventDate: daysFromNow(6, 19),
  },
  {
    title: "Turag Riverbank Cleanup Drive – Uttara",
    description:
      "Plastic waste is choking the Turag river near Uttara Sector 18. Join a three-hour cleanup along the bank with gloves, sacks and grabbers provided. Collected plastic will be weighed and handed over to a local recycling cooperative. Children above 12 are welcome with a guardian.",
    eventType: "Cleanup",
    thumbnail: img("photo-1618477461853-cf6ed80faba5"),
    location: "Sector 18 Riverbank, Uttara, Dhaka",
    eventDate: daysFromNow(9, 7, 30),
  },
  {
    title: "Tree Plantation at Dhanmondi Lake",
    description:
      "We are planting 300 native saplings, including neem, krishnachura and jarul, around the Dhanmondi Lake walkway in partnership with the ward councillor's office. Volunteers will dig, plant, water and tag each sapling, and adopt a tree to check on monthly. Tools and saplings are provided.",
    eventType: "Plantation",
    thumbnail: img("photo-1542601906990-b4d3fb778b09"),
    location: "Rabindra Sarobar, Dhanmondi, Dhaka",
    eventDate: daysFromNow(11, 8),
  },
  {
    title: "Iftar-style Food Distribution in Old Dhaka",
    description:
      "Hot meals of khichuri, egg and a seasonal fruit will be packed and distributed to rickshaw pullers, porters and homeless families around Sadarghat and Chawkbazar. Volunteers will pack 800 meal boxes in the afternoon and distribute them in the evening in coordinated groups.",
    eventType: "Food Distribution",
    thumbnail: img("photo-1593113598332-cd288d649433"),
    location: "Sadarghat Launch Terminal, Old Dhaka",
    eventDate: daysFromNow(13, 16),
  },
  {
    title: "Community Blood Donation Camp – Farmgate",
    description:
      "Thalassemia patients across Dhaka need regular transfusions. In partnership with a licensed blood bank, we are running a one-day donation camp with screening, donor cards and refreshments. Donors must be 18 to 60 years old, weigh over 50 kg and have not donated in the last four months.",
    eventType: "Blood Donation",
    thumbnail: img("photo-1615461066841-6116e61058f4"),
    location: "Krishibid Institution, Farmgate, Dhaka",
    eventDate: daysFromNow(15, 10),
  },
  {
    title: "Weekend Learning Circle for Street Children – Kamalapur",
    description:
      "Every Saturday we run a learning circle for children living around Kamalapur Railway Station. This session focuses on Bangla reading, basic arithmetic and hand-washing habits. Volunteers will each mentor a small group of three to four children. No teaching experience required, just patience and kindness.",
    eventType: "Education",
    thumbnail: img("photo-1497486751825-1233686d5d80"),
    location: "Kamalapur Railway Station, Dhaka",
    eventDate: daysFromNow(17, 15),
  },
  {
    title: "Free Health Camp for Garment Workers – Ashulia",
    description:
      "Volunteer doctors and nursing students will provide free check-ups for blood pressure, diabetes and anaemia, along with basic medicines and eye screening, for garment workers and their families. Non-medical volunteers are needed for registration, queue management and translating prescriptions into simple Bangla.",
    eventType: "Health Camp",
    thumbnail: img("photo-1576091160550-2173dba999ef"),
    location: "Baipail Community Center, Ashulia, Dhaka",
    eventDate: daysFromNow(20, 9),
  },
  {
    title: "Back-to-School Stationery Drive – Mirpur 1",
    description:
      "Many children in Mirpur 1's informal settlements return to school without notebooks, pencils or bags. We will assemble and distribute 400 stationery kits donated by local businesses and neighbours. Volunteers will help pack kits by class level and hand them out with a short reading activity.",
    eventType: "Education",
    thumbnail: img("photo-1509099836639-18ba1795216d"),
    location: "Shah Ali Bagh Community School, Mirpur 1, Dhaka",
    eventDate: daysFromNow(24, 10),
  },
  {
    title: "Flood Relief Packing Day – Tejgaon Warehouse",
    description:
      "Families in northern districts are recovering from seasonal floods. We are packing relief bags containing rice, lentils, oil, oral saline, sanitary pads and soap for shipment by truck. Volunteers are needed to weigh, pack, label and load bags. Lunch will be provided for all volunteers.",
    eventType: "Other",
    thumbnail: img("photo-1559027615-cd4628902d4a"),
    location: "Tejgaon Industrial Area, Dhaka",
    eventDate: daysFromNow(28, 9, 30),
  },
];

async function seed() {
  const db = await getDb();
  const collection = db.collection<EventDoc>("events");
  const now = new Date();

  let inserted = 0;
  let refreshed = 0;
  for (const event of seedEvents) {
    const result = await collection.updateOne(
      { title: event.title, creatorEmail: SEED_CREATOR.email },
      {
        $set: { ...event, creatorName: SEED_CREATOR.name, updatedAt: now },
        $setOnInsert: { creatorEmail: SEED_CREATOR.email, createdAt: now },
      },
      { upsert: true },
    );
    if (result.upsertedCount) inserted += 1;
    else refreshed += 1;
  }

  console.log(`Seed complete: ${inserted} inserted, ${refreshed} refreshed (${seedEvents.length} total).`);
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
