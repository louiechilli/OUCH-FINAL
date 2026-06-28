export interface Booking {
  id: string;
  client: string;
  service: string;
  time: string;
  artist: string;
  status: "confirmed" | "pending" | "complete";
}

export const todaysBookings: Booking[] = [
  { id: "b1", client: "Maya Reed", service: "Forearm sleeve — session 2", time: "10:00", artist: "Jay", status: "complete" },
  { id: "b2", client: "Tom Hutchins", service: "Fine line script", time: "11:30", artist: "Soph", status: "complete" },
  { id: "b3", client: "Aisha Khan", service: "Consultation", time: "13:00", artist: "Jay", status: "confirmed" },
  { id: "b4", client: "Liam Foster", service: "Touch-up — back piece", time: "15:30", artist: "Dex", status: "pending" },
];

export const upcomingBookings: Booking[] = [
  { id: "b5", client: "Ella Marsh", service: "Half sleeve — session 1", time: "Tomorrow, 09:30", artist: "Soph", status: "confirmed" },
  { id: "b6", client: "Noah Price", service: "Cover-up consult", time: "Tomorrow, 12:00", artist: "Jay", status: "pending" },
  { id: "b7", client: "Grace Lin", service: "Small flash piece", time: "Thu, 14:00", artist: "Dex", status: "confirmed" },
];

export const todaysStats = {
  revenue: 842,
  bookingsCount: todaysBookings.length,
  avgTicket: Math.round(842 / todaysBookings.length),
};
