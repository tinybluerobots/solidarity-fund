export type Volunteer = {
	id: string;
	name: string;
	phone?: string;
	email?: string;
	isAdmin: boolean;
	requiresPasswordReset: boolean;
	createdAt: string;
	updatedAt: string;
};

export type CreateVolunteer = {
	name: string;
	phone?: string;
	email?: string;
	password: string;
	isAdmin?: boolean;
};

export type UpdateVolunteer = {
	name?: string;
	phone?: string | null;
	email?: string | null;
	password?: string;
};

// Commands

import type { Command, Event } from "@event-driven-io/emmett";

export type CreateVolunteerCommand = Command<
	"CreateVolunteer",
	{
		id: string;
		name: string;
		phone?: string;
		email?: string;
		passwordHash: string;
		isAdmin?: boolean;
		requiresPasswordReset?: boolean;
		createdAt: string;
	}
>;

export type UpdateVolunteerCommand = Command<
	"UpdateVolunteer",
	{
		id: string;
		name: string;
		phone?: string;
		email?: string;
		passwordHash: string;
		updatedAt: string;
	}
>;

export type DeleteVolunteerCommand = Command<
	"DeleteVolunteer",
	{
		id: string;
		deletedAt: string;
	}
>;

export type ChangePasswordCommand = Command<
	"ChangePassword",
	{
		id: string;
		passwordHash: string;
		changedAt: string;
	}
>;

export type VolunteerCommand =
	| CreateVolunteerCommand
	| UpdateVolunteerCommand
	| DeleteVolunteerCommand
	| ChangePasswordCommand;

// Events

export type VolunteerCreated = Event<
	"VolunteerCreated",
	{
		id: string;
		name: string;
		phone?: string;
		email?: string;
		passwordHash: string;
		isAdmin?: boolean;
		requiresPasswordReset?: boolean;
		createdAt: string;
	}
>;

export type VolunteerUpdated = Event<
	"VolunteerUpdated",
	{
		id: string;
		name: string;
		phone?: string;
		email?: string;
		passwordHash: string;
		updatedAt: string;
	}
>;

export type VolunteerDeleted = Event<
	"VolunteerDeleted",
	{
		id: string;
		deletedAt: string;
	}
>;

export type PasswordChanged = Event<
	"PasswordChanged",
	{
		id: string;
		passwordHash: string;
		changedAt: string;
	}
>;

export type VolunteerEvent =
	| VolunteerCreated
	| VolunteerUpdated
	| VolunteerDeleted
	| PasswordChanged;

export type VolunteerEventType = VolunteerEvent["type"];

// State

export type VolunteerState =
	| { status: "initial" }
	| {
			status: "active";
			id: string;
			name: string;
			phone?: string;
			email?: string;
			passwordHash: string;
			isAdmin: boolean;
			requiresPasswordReset: boolean;
			createdAt: string;
			updatedAt: string;
	  }
	| { status: "deleted" };
