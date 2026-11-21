## **Stack:**

* Framework: Next.js (App Router), TypeScript  
* Hosting: Vercel, with code on GitHub  
* Database: Neon Postgres  
* ORM: Prisma  
* Time: store timestamps in UTC; calculate and display all dates in America/Los\_Angeles   
* Design: mobile-first (large tap targets), responsive, fully usable on desktop

## **Users and Roles:**

* **Employee:** counts inventory at the cafes they are assigned to.  
* **Admin:** everything an employee can do, plus management of employees, sections, and items.  
* **Admin status is per cafe.** A person can be an admin at one cafe and an employee at another.  
* Employees are **deactivated**, never deleted, so history stays intact.  
* The last active admin at a cafe cannot be demoted or deactivated.

## **Sign-In Flow**

* **Landing page**  
  * Toast-style number pad. The employee enters their Toast PIN.  
  * PINs are 3 or 4 digits (not a fixed length), so the pad has an Enter key.  
  * No inventory status or timestamp is shown here.  
* **After PIN entry**  
1. The PIN must match one active user. **PINs are unique across all cafes.**  
2. If the user belongs to more than one cafe, they pick the location. If only one, they go straight in.  
3. The app stores the user and selected cafe in a session cookie so they stay signed in on their phone. Sessions last 7 days and renew while the app is in use; there is a Sign out option.  
* Repeated wrong PINs are rate-limited: 5 failures from one IP in 10 minutes blocks that IP for 10 minutes.  
4. The user lands on the Employee view. Admins also see an entry point to Admin.  
* Note: the PIN is entered by an admin when adding the employee, and matches the person's Toast PIN.

## **Employee View**

**Header**

* Greeting: *Welcome back, \[first name\]*  
* Current cafe, with a dropdown switcher if the user has more than one  
* *Inventory last updated \[date/time\] by \[name\]* for the selected cafe, derived from the most recent submission  
* Hamburger menu at top: **Create PDF** and **View today's combined order**

**Sections**

* Inventory is organized into modular, collapsible section cards (for example Perishables, Sauce Ingredients).  
* By default only sections **scheduled for today** are shown. A section is scheduled if today's weekday is in its days-needed list, or today's date is in its extra dates.  
  * Additional sections are shown collapsed and disabled under the save button and have an ‘add’ button  
* **Adding on the fly:** the employee can add any existing section or individual existing item that is not scheduled today. They cannot create new items or sections (admins only).  
  * Once submitted, sections and items added on the fly show up for everyone counting at that cafe that day, labeled "Added by [name]". Before submitting, an add only appears on the phone of the person who added it (and only they can remove it).  
  * There should be a search bar with placeholder text ‘search items to add to inventory’

**Counting**

* Each item shows its name, unit, and today's min and max.  
* The employee enters **current stock**. Decimals are allowed (for example 0.5 bunch), and the input steps by 0.5.  
* **To order** is calculated automatically:  
  * If current stock is **below the minimum**: to-order \= maximum minus current, rounded up to a whole number.  
  * Otherwise: to-order \= 0\.  
* **Plenty:** instead of counting, the employee can tap **Plenty** on an item that is obviously above the minimum. It's saved with no count and nothing to order, counts as checked (so the section can be complete), and as the latest count it overrides an earlier order that day.  
* The employee can manually edit the to-order value after it is generated.   
* Today's min and max come from the quantity rules (explained in below section).

**Submitting**

* A **Submit** button saves everything to the database as one submission.  
* Items already submitted today are **pre-filled** with the latest submitted values (count, edited order, or Plenty), labeled with who submitted them and when, so the next person can adjust. Only items that were changed or newly counted are sent on Submit; untouched pre-filled items are not re-submitted.  
* Items left blank are not included; the Submit area shows how many items weren't counted.  
* Counts entered but not yet submitted are kept on that phone (per user, cafe and day) so a reload or locked screen doesn't lose them.  
* The server recalculates the automatic to-order amount from that day's rules; only amounts the employee edited are taken as entered.  
* **Combined order view (per cafe, per day)**  
* Merges all of today's submissions into one list of items to order.  
* If two people counted the same item, the **latest count wins**.  
* Only items with a to-order amount above 0 are included.  
* A single **Copy for Slack** button copies the structured text (title, date and items; no "Submitted by" line).  
* The combined order page (from the menu) also lists who submitted and when, and who counted each item.  
* On the Inventory page, after submitting, the form clears and a **Copy for Slack** button for today's combined order appears below the Submit button (and stays for the rest of the day once anyone has submitted).  
* Example output:

```
Kaizen Inventory Order, Fri 11/20/2026

PERISHABLES
- Bananas: 3 bunches
- Cucumber: 2 gallons

MILK
- Whole: 30 gallons
```

## **Admin View**

* **Tabs** at the top of the screen should allow admin to toggle between inventory sections and employee views

**Employees**

* Add an employee: first name, last name, PIN (entered manually), and the cafes they belong to with a role at each.  
* Edit first and last name, PIN, cafe assignments, and role.  
* Change a users status between employee and admin (per cafe).  
* Deactivate or reactivate. Deactivated people can't sign in at any cafe; their past counts stay in the order history. People are never deleted.  
* Admins manage the people who work at their selected cafe. They can only add people to, or change roles at, cafes where they are an admin; other cafes are shown read-only.  
* Any admin at one of a person's cafes can deactivate them, as long as no cafe is left without an active admin.  
* PINs are hidden (shown as ••••) until an admin taps Show. Each PIN must be unique across all cafes.

**Sections**

* Create, edit, reorder, and delete sections. Deleting a section permanently removes it with its items and their quantity rules; a section with items that have already been counted can't be deleted.  
* Set **days of the week needed** (any combination) and **additional one-time dates**.

**Items**

* Create, edit, and delete items within a section. Fields: name, unit (a single fixed label, for example *bunches*), and quantities. Admins can reorder items within a section; new items are added at the bottom.  
* Deleting an item permanently removes it and its quantity rules. An item that has already been counted in a submission can't be deleted, so past orders stay intact.  
* **Every new item must have a default min and max** before it can be saved.  
* Add optional **weekday rules** and **one-time date rules** (see section 7).

**CSV import and export**

* Export one section or all sections for a cafe. Import a CSV into any cafe, which supports sharing item lists across cafes.  
* Import is previewed before it is committed, with row-level errors shown.  
* Matching: an imported item whose section name and item name match an existing item at that cafe **updates** it. Otherwise it is created.  
* Suggested columns: `section, item, unit, default_min, default_max, mon_min, mon_max, tue_min, tue_max, wed_min, wed_max, thu_min, thu_max, fri_min, fri_max, sat_min, sat_max, sun_min, sun_max, section_days`. Weekday columns are optional. One-time date rules are not part of the CSV.

## **Quantity Rules**

Each item has one or more rules. Three types:

**Resolution order for a given day:** date rule, then weekday rule, then default.

**Rules**

* Weekday rules are stored **one row per day**. The admin UI lets the admin pick a group (for example Mon to Thu) and creates one row per selected day.  
* An item can have only one rule per weekday, one per date, and one default.  
* Min must be less than or equal to max. Values may be decimals.  
* Rules are never silently deleted when an item is deactivated.

| Type | Applies To | Example |
| :---- | :---- | :---- |
| Default | Every Day | Bananas: min 2, max 4 bunches |
| Weekday | One specific day of the week | Saturday: min 4, max 6 |
| Date | One specific calendar date | 2/13/27: min 5, max 5 |

* Weekday rules are stored **one row per day**. The admin UI lets the admin pick a group (for example Mon to Thu) and creates one row per selected day.  
* An item can have only one rule per weekday, one per date, and one default.  
* Min must be less than or equal to max. Values may be decimals.

## **Order History**

## A View order history page lets any signed-in employee or admin look back at what was ordered, by date or by item. It is read-only and shows data for the selected cafe only.

## **Access**

* ## Opened from the hamburger menu in the top corner of every signed-in screen.

## **Calendar**

* ## A month grid in America/Los\_Angeles time with previous and next month controls. Weeks start on Monday.

* ## Dates that have at least one submission are marked with the colors that correspond with the sections that were inventoried on those days. For example, if milk, perishables, and cups were ordered, there would be three dots each on that day. Future dates cannot be selected.

* ## Tapping a date shows what was ordered that day: items with a to-order amount above 0, grouped by section, with the amount and unit.

* ## The day view uses the same merge rule as the combined order view (latest count wins) and lists who submitted and when. It also has a Copy for Slack button for that day's order.

* ## A date with no submissions shows *No inventory submitted this day*.

## **Search**

* ## A search bar at the top of the page searches item names as you type.

* ## Each result shows the last time the item was ordered (date, amount, and who submitted it) and the last time it was counted.

* ## Tapping a result opens that date in the calendar.

* ## Items that have never been ordered show *Not ordered yet*.

* ## Deactivated items still appear in search so their history stays visible, and are labeled as inactive.

## **Security**

* Simple PIN sign-in is acceptable for this project  
* All admin pages and actions are authorized **on the server** by checking the user's role for the selected cafe. Hiding buttons in the UI is not enough, since an employee could otherwise reach admin actions directly.  
* Users can only read and write data for cafes they belong to.

## **Data Model**

**Entities**

* **Cafe:** id, name  
* **User:** id, firstName, lastName, pin (unique), active. Greetings use the first name only.  
* **UserCafe:** user, cafe, role  
* **Section:** id, cafe, name, daysOfWeek (0-6 array), active  
* **SectionExtraDate:** section, date  
* **Item:** id, section, name, unit, active  
* **QuantityRule:** id, item, type, weekday (only for weekday rules), date (only for date rules), min, max  
* **Submission:** id, cafe, user, businessDate (LA date), submittedAt (UTC)  
* **DayAddition:** cafe, businessDate, section or item, addedBy (sections/items added on the fly for a day, shared once submitted)  
* **SubmissionLine:** submission, item, currentCount (empty when marked Plenty), autoOrder, finalOrder, manuallyEdited, wellStocked (Plenty)

**Derived, not stored:**

* Last updated and by whom: most recent Submission for the cafe.  
* Date last taken for a section: latest submission containing any of its items.  
* Day last ordered for an item: latest line with finalOrder greater than 0\.

Landing Page: 

* ~~Show a timestamp of when the inventory was last updated and by whom~~ (superseded: see Sign-In Flow; "last updated" is shown in the Employee view header instead)  
* Show sign in with Toast-like number pad, employees will enter their Toast number

2 Views:

* Employee  
  * “Welcome back, \[name\]”  
  * View modular windows that show different sections of inventory such as perishables, sauce ingredients, etc  
  * Employees will fill in the current number in stock and the number needed to order will be automatically generated  
    * The to-order number can be manually edited by the employee after the amount is auto generated  
    * If current stock is below the minimum, to-order \= maximum − current, otherwise 0  
  * Employee view will default to show only the inventory sections that have been selected by admin for that day, however they should also be able to add sections or individual items that may need to be flagged on the fly  
  * When employees finish, they will click a ‘save’ or ‘submit’ button which will save all of the data to the database and automatically generate a structured text to copy-and-paste into Slack that details what needs to be ordered and how much of it  
  * If employees work at multiple locations, they can select the location that they’re entering inventory for when they sign in  
* Admin  
  * Ability to add or deactivate employees and promote/demote from admin status  
    * The admin will manually enter the employees PIN when adding them to the database  
  * Ability to add or remove individual items from a section  
    * Ability to change minimum quantity needed and maximum quantity needed  
      * There should be the ability to create a custom minimum and maximum quantity on certain days of the week. For example, we may need twice the amount of bananas needed on Saturday as there is on Tuesday  
      * On top of setting custom amounts for certain work days (e.g., M-Th 2 bunches of bananas, F-Sun 3 bunches), admin should be able to set an amount for a one-time only day, such as 2/13/27 there need to be 5 bunches of bananas for a specific event)

* Mobile-first experience with a responsive design that also works on a desktop. Employees will primarily take inventory using personal phones at work  
* Want to create and host using Vercel and GitHub  
* Use America/Los\_Angeles time for dates  
* Database using Neon and Prisma for users, sections, and items  
  * Users:  
    * Name  
    * employee\_ID  
    * Employee PIN (a number sequence that matches the one from Toast), used to sign in  
    * Status: employee, admin  
    * UserCafe jointable: user, cafe, role  
  * Section:  
    * section\_ID  
    * cafe\_ID  
    * Name  
    * Date last taken  
    * Days of the week needed  
    * Additional dates that need to be taken  
  * Item:  
    * item\_ID  
    * section\_ID  
    * Name  
    * Unit (entered by admin, can be multiple possibilities, such as bunches or bananas)  
    * Day last ordered  
  * Quantity rules:  
    * item\_ID  
    * Type: default, weekday, date  
      * Precedence would be one-time date, then weekday, then default  
    * Minimum quantity  
    * Maximum quantity

* Idea: if some part of this goes down there should be a printable PDF so they can still take inventory using the old method if the system fails

## **Build Order**

1. Project setup, Neon, Prisma schema and migrations, seed script (cafes, first admin)  
2. PIN sign-in, session, location select, server-side role checks  
3. Admin: sections, items, quantity rules  
4. Employee counting, rule resolution, order calculation, submit  
5. Combined order view and Slack text  
6. Admin: employee management  
7. Order history page: calendar view and item search  
8. Print today's sheet  
9. Admin: CSV import and export  
10. Mobile polish and real-world testing at the cafe

