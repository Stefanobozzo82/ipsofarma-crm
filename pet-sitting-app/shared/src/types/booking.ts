import type {
  BookingStatus,
  CancellationPolicyType,
  MeetGreetStatus,
  PaymentStatus,
  PriceUnit,
  ServiceType,
} from "../enums";

export interface Booking {
  id: string;
  ownerId: string;
  sitterId: string;
  serviceType: ServiceType;
  status: BookingStatus;
  startDate: string; // "YYYY-MM-DD"
  endDate: string | null;
  startTime: string | null; // "HH:MM"
  endTime: string | null;
  quantity: number;
  unitPrice: number;
  priceUnit: PriceUnit;
  priceTotal: number;
  platformFee: number;
  sitterPayout: number;
  currency: string;
  paymentStatus: PaymentStatus;
  stripePaymentIntentId: string | null;
  cancellationPolicy: CancellationPolicyType;
  notes: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  petIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MeetGreetRequest {
  id: string;
  ownerId: string;
  sitterId: string;
  proposedDatetime: string;
  status: MeetGreetStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  type: "charge" | "refund";
  amount: number;
  currency: string;
  stripeObjectId: string;
  status: string;
  createdAt: string;
}

export interface Payout {
  id: string;
  sitterId: string;
  amount: number;
  currency: string;
  stripePayoutId: string | null;
  status: "pending" | "paid" | "failed";
  requestedAt: string;
  paidAt: string | null;
}
