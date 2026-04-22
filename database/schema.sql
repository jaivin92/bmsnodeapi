-- ============================================================
-- Building Management System (BMS) - SQL Server Schema
-- USA Standard | Version 1.0
-- ============================================================

USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'BuildingManagementDB')
    CREATE DATABASE BuildingManagementDB;
GO

USE BuildingManagementDB;
GO

-- ============================================================
-- BUILDINGS
-- ============================================================
CREATE TABLE Buildings (
    BuildingID      UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    BuildingName    NVARCHAR(200)    NOT NULL,
    BuildingType    NVARCHAR(50)     NOT NULL CHECK (BuildingType IN ('Commercial','Residential','Apartment')),
    Address         NVARCHAR(500)    NOT NULL,
    City            NVARCHAR(100)    NOT NULL,
    State           NVARCHAR(50)     NOT NULL,
    ZipCode         NVARCHAR(10)     NOT NULL,
    Country         NVARCHAR(50)     NOT NULL DEFAULT 'USA',
    TotalFloors     INT              NOT NULL DEFAULT 1,
    TotalUnits      INT              NOT NULL DEFAULT 1,
    Phone           NVARCHAR(20),
    Email           NVARCHAR(200),
    LogoURL         NVARCHAR(500),
    IsActive        BIT              NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- WINGS / BLOCKS
-- ============================================================
CREATE TABLE Wings (
    WingID          UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    BuildingID      UNIQUEIDENTIFIER NOT NULL REFERENCES Buildings(BuildingID),
    WingName        NVARCHAR(100)    NOT NULL,
    TotalFloors     INT              NOT NULL DEFAULT 1,
    IsActive        BIT              NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- UNITS / APARTMENTS / OFFICES
-- ============================================================
CREATE TABLE Units (
    UnitID          UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    BuildingID      UNIQUEIDENTIFIER NOT NULL REFERENCES Buildings(BuildingID),
    WingID          UNIQUEIDENTIFIER REFERENCES Wings(WingID),
    UnitNumber      NVARCHAR(20)     NOT NULL,
    Floor           INT              NOT NULL,
    UnitType        NVARCHAR(50)     NOT NULL CHECK (UnitType IN ('Apartment','Office','Shop','Penthouse')),
    AreaSqFt        DECIMAL(10,2),
    Bedrooms        INT              DEFAULT 0,
    Bathrooms       INT              DEFAULT 0,
    Status          NVARCHAR(20)     NOT NULL DEFAULT 'Vacant' CHECK (Status IN ('Occupied','Vacant','Maintenance')),
    MonthlyRent     DECIMAL(12,2),
    SecurityDeposit DECIMAL(12,2),
    IsActive        BIT              NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    UNIQUE (BuildingID, UnitNumber)
);
GO

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE Users (
    UserID          UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    Email           NVARCHAR(255)    NOT NULL UNIQUE,
    PasswordHash    NVARCHAR(255)    NOT NULL,
    FullName        NVARCHAR(200)    NOT NULL,
    Phone           NVARCHAR(20),
    Role            NVARCHAR(30)     NOT NULL CHECK (Role IN ('SuperAdmin','BuildingAdmin','SecurityStaff','MaintenanceStaff','CanteenStaff','Resident','Tenant')),
    BuildingID      UNIQUEIDENTIFIER REFERENCES Buildings(BuildingID),
    UnitID          UNIQUEIDENTIFIER REFERENCES Units(UnitID),
    ProfilePhotoURL NVARCHAR(500),
    IsOwner         BIT              NOT NULL DEFAULT 0,
    IsActive        BIT              NOT NULL DEFAULT 1,
    IsVerified      BIT              NOT NULL DEFAULT 0,
    VerificationToken NVARCHAR(255),
    ResetToken      NVARCHAR(255),
    ResetTokenExpiry DATETIME2,
    LastLogin       DATETIME2,
    MoveInDate      DATE,
    MoveOutDate     DATE,
    EmergencyContact NVARCHAR(200),
    EmergencyPhone  NVARCHAR(20),
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE AuditLogs (
    LogID           BIGINT           IDENTITY(1,1) PRIMARY KEY,
    UserID          UNIQUEIDENTIFIER REFERENCES Users(UserID),
    Action          NVARCHAR(100)    NOT NULL,
    TableName       NVARCHAR(100),
    RecordID        NVARCHAR(100),
    OldValues       NVARCHAR(MAX),
    NewValues       NVARCHAR(MAX),
    IPAddress       NVARCHAR(50),
    UserAgent       NVARCHAR(500),
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- PARKING SLOTS
-- ============================================================
CREATE TABLE ParkingSlots (
    SlotID          UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    BuildingID      UNIQUEIDENTIFIER NOT NULL REFERENCES Buildings(BuildingID),
    SlotNumber      NVARCHAR(20)     NOT NULL,
    SlotType        NVARCHAR(20)     NOT NULL CHECK (SlotType IN ('Car','Bike','Truck','Handicapped')),
    Level           NVARCHAR(20),
    Status          NVARCHAR(20)     NOT NULL DEFAULT 'Available' CHECK (Status IN ('Available','Occupied','Reserved','Maintenance')),
    AssignedToUnit  UNIQUEIDENTIFIER REFERENCES Units(UnitID),
    MonthlyRate     DECIMAL(10,2),
    HourlyRate      DECIMAL(8,2),
    IsActive        BIT              NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    UNIQUE (BuildingID, SlotNumber)
);
GO

CREATE TABLE ParkingBookings (
    BookingID       UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    SlotID          UNIQUEIDENTIFIER NOT NULL REFERENCES ParkingSlots(SlotID),
    UserID          UNIQUEIDENTIFIER NOT NULL REFERENCES Users(UserID),
    VehicleNumber   NVARCHAR(20)     NOT NULL,
    VehicleType     NVARCHAR(20)     NOT NULL,
    BookingType     NVARCHAR(20)     NOT NULL CHECK (BookingType IN ('Hourly','Daily','Monthly')),
    StartTime       DATETIME2        NOT NULL,
    EndTime         DATETIME2,
    Amount          DECIMAL(10,2),
    PaymentStatus   NVARCHAR(20)     DEFAULT 'Pending' CHECK (PaymentStatus IN ('Pending','Paid','Refunded')),
    QRCode          NVARCHAR(500),
    Status          NVARCHAR(20)     DEFAULT 'Active' CHECK (Status IN ('Active','Completed','Cancelled')),
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- BILLING
-- ============================================================
CREATE TABLE Bills (
    BillID          UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    BuildingID      UNIQUEIDENTIFIER NOT NULL REFERENCES Buildings(BuildingID),
    UnitID          UNIQUEIDENTIFIER REFERENCES Units(UnitID),
    UserID          UNIQUEIDENTIFIER REFERENCES Users(UserID),
    BillType        NVARCHAR(50)     NOT NULL CHECK (BillType IN ('Maintenance','Electricity','Gas','Water','Internet','Parking','Canteen','Other')),
    BillMonth       DATE             NOT NULL,
    Amount          DECIMAL(12,2)    NOT NULL,
    TaxAmount       DECIMAL(10,2)    DEFAULT 0,
    TotalAmount     DECIMAL(12,2)    NOT NULL,
    DueDate         DATE             NOT NULL,
    FileURL         NVARCHAR(500),
    Description     NVARCHAR(1000),
    PaymentStatus   NVARCHAR(20)     NOT NULL DEFAULT 'Pending' CHECK (PaymentStatus IN ('Pending','Paid','Overdue','Waived','Partial')),
    PaidAmount      DECIMAL(12,2)    DEFAULT 0,
    PaidAt          DATETIME2,
    StripePaymentID NVARCHAR(200),
    ReminderSentAt  DATETIME2,
    Notes           NVARCHAR(1000),
    CreatedBy       UNIQUEIDENTIFIER REFERENCES Users(UserID),
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

CREATE TABLE PaymentTransactions (
    TransactionID   UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    BillID          UNIQUEIDENTIFIER NOT NULL REFERENCES Bills(BillID),
    UserID          UNIQUEIDENTIFIER NOT NULL REFERENCES Users(UserID),
    Amount          DECIMAL(12,2)    NOT NULL,
    PaymentMethod   NVARCHAR(30)     NOT NULL CHECK (PaymentMethod IN ('Stripe','PayPal','ACH','Cash','Check')),
    TransactionRef  NVARCHAR(200)    NOT NULL,
    Status          NVARCHAR(20)     NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','Success','Failed','Refunded')),
    GatewayResponse NVARCHAR(MAX),
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- VISITORS
-- ============================================================
CREATE TABLE Visitors (
    VisitorID       UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    BuildingID      UNIQUEIDENTIFIER NOT NULL REFERENCES Buildings(BuildingID),
    ResidentID      UNIQUEIDENTIFIER NOT NULL REFERENCES Users(UserID),
    UnitID          UNIQUEIDENTIFIER REFERENCES Units(UnitID),
    VisitorName     NVARCHAR(200)    NOT NULL,
    VisitorPhone    NVARCHAR(20),
    VisitorEmail    NVARCHAR(255),
    IDType          NVARCHAR(30),
    IDNumber        NVARCHAR(50),
    Purpose         NVARCHAR(200),
    VisitorType     NVARCHAR(30)     DEFAULT 'Personal' CHECK (VisitorType IN ('Personal','Delivery','Service','Business','Emergency')),
    ExpectedArrival DATETIME2,
    CheckInTime     DATETIME2,
    CheckOutTime    DATETIME2,
    QRCode          NVARCHAR(500),
    OTP             NVARCHAR(10),
    OTPExpiry       DATETIME2,
    PhotoURL        NVARCHAR(500),
    ApprovedBy      UNIQUEIDENTIFIER REFERENCES Users(UserID),
    Status          NVARCHAR(20)     NOT NULL DEFAULT 'Expected' CHECK (Status IN ('Expected','CheckedIn','CheckedOut','Denied','Cancelled')),
    VehicleNumber   NVARCHAR(20),
    Notes           NVARCHAR(500),
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- CANTEEN / FOOD
-- ============================================================
CREATE TABLE CanteenMenus (
    MenuID          UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    BuildingID      UNIQUEIDENTIFIER NOT NULL REFERENCES Buildings(BuildingID),
    ItemName        NVARCHAR(200)    NOT NULL,
    Description     NVARCHAR(500),
    Category        NVARCHAR(50)     NOT NULL CHECK (Category IN ('Breakfast','Lunch','Dinner','Snacks','Beverages')),
    Price           DECIMAL(10,2)    NOT NULL,
    ImageURL        NVARCHAR(500),
    IsVegetarian    BIT              NOT NULL DEFAULT 0,
    IsAvailable     BIT              NOT NULL DEFAULT 1,
    DayOfWeek       NVARCHAR(100),
    AvailableFrom   TIME,
    AvailableTo     TIME,
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

CREATE TABLE CanteenOrders (
    OrderID         UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    BuildingID      UNIQUEIDENTIFIER NOT NULL REFERENCES Buildings(BuildingID),
    UserID          UNIQUEIDENTIFIER NOT NULL REFERENCES Users(UserID),
    UnitID          UNIQUEIDENTIFIER REFERENCES Units(UnitID),
    OrderDate       DATE             NOT NULL DEFAULT CAST(GETUTCDATE() AS DATE),
    DeliveryTime    TIME,
    TotalAmount     DECIMAL(10,2)    NOT NULL,
    PaymentStatus   NVARCHAR(20)     DEFAULT 'Pending' CHECK (PaymentStatus IN ('Pending','Paid','Failed')),
    OrderStatus     NVARCHAR(30)     NOT NULL DEFAULT 'Placed' CHECK (OrderStatus IN ('Placed','Confirmed','Preparing','Ready','Delivered','Cancelled')),
    SpecialInstructions NVARCHAR(500),
    IsSubscription  BIT              NOT NULL DEFAULT 0,
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

CREATE TABLE CanteenOrderItems (
    ItemID          UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    OrderID         UNIQUEIDENTIFIER NOT NULL REFERENCES CanteenOrders(OrderID),
    MenuID          UNIQUEIDENTIFIER NOT NULL REFERENCES CanteenMenus(MenuID),
    Quantity        INT              NOT NULL,
    UnitPrice       DECIMAL(10,2)    NOT NULL,
    TotalPrice      DECIMAL(10,2)    NOT NULL
);
GO

-- ============================================================
-- COMPLAINTS / MAINTENANCE
-- ============================================================
CREATE TABLE Complaints (
    ComplaintID     UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    BuildingID      UNIQUEIDENTIFIER NOT NULL REFERENCES Buildings(BuildingID),
    UnitID          UNIQUEIDENTIFIER REFERENCES Units(UnitID),
    RaisedBy        UNIQUEIDENTIFIER NOT NULL REFERENCES Users(UserID),
    AssignedTo      UNIQUEIDENTIFIER REFERENCES Users(UserID),
    Category        NVARCHAR(50)     NOT NULL CHECK (Category IN ('Plumbing','Electrical','Carpentry','Cleaning','Security','Elevator','AC','Internet','Other')),
    Title           NVARCHAR(300)    NOT NULL,
    Description     NVARCHAR(2000)   NOT NULL,
    Priority        NVARCHAR(20)     NOT NULL DEFAULT 'Medium' CHECK (Priority IN ('Low','Medium','High','Emergency')),
    Status          NVARCHAR(30)     NOT NULL DEFAULT 'Open' CHECK (Status IN ('Open','Assigned','InProgress','OnHold','Resolved','Closed','Rejected')),
    PhotoURL        NVARCHAR(500),
    ResolutionNotes NVARCHAR(2000),
    SLADeadline     DATETIME2,
    ResolvedAt      DATETIME2,
    RatingByResident INT             CHECK (RatingByResident BETWEEN 1 AND 5),
    FeedbackComment NVARCHAR(500),
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

CREATE TABLE ComplaintUpdates (
    UpdateID        UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    ComplaintID     UNIQUEIDENTIFIER NOT NULL REFERENCES Complaints(ComplaintID),
    UpdatedBy       UNIQUEIDENTIFIER NOT NULL REFERENCES Users(UserID),
    StatusChange    NVARCHAR(30),
    Comment         NVARCHAR(1000)   NOT NULL,
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- VOTING / POLLS
-- ============================================================
CREATE TABLE Polls (
    PollID          UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    BuildingID      UNIQUEIDENTIFIER NOT NULL REFERENCES Buildings(BuildingID),
    Title           NVARCHAR(300)    NOT NULL,
    Description     NVARCHAR(2000),
    CreatedBy       UNIQUEIDENTIFIER NOT NULL REFERENCES Users(UserID),
    StartDate       DATETIME2        NOT NULL,
    EndDate         DATETIME2        NOT NULL,
    IsAnonymous     BIT              NOT NULL DEFAULT 0,
    IsMultiChoice   BIT              NOT NULL DEFAULT 0,
    Status          NVARCHAR(20)     NOT NULL DEFAULT 'Active' CHECK (Status IN ('Draft','Active','Closed','Cancelled')),
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

CREATE TABLE PollOptions (
    OptionID        UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    PollID          UNIQUEIDENTIFIER NOT NULL REFERENCES Polls(PollID),
    OptionText      NVARCHAR(500)    NOT NULL,
    DisplayOrder    INT              NOT NULL DEFAULT 0
);
GO

CREATE TABLE PollVotes (
    VoteID          UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    PollID          UNIQUEIDENTIFIER NOT NULL REFERENCES Polls(PollID),
    OptionID        UNIQUEIDENTIFIER NOT NULL REFERENCES PollOptions(OptionID),
    VotedBy         UNIQUEIDENTIFIER NOT NULL REFERENCES Users(UserID),
    VotedAt         DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    UNIQUE (PollID, OptionID, VotedBy)
);
GO

-- ============================================================
-- NOTICES / COMMUNICATIONS
-- ============================================================
CREATE TABLE Notices (
    NoticeID        UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    BuildingID      UNIQUEIDENTIFIER REFERENCES Buildings(BuildingID),
    Title           NVARCHAR(300)    NOT NULL,
    Content         NVARCHAR(MAX)    NOT NULL,
    NoticeType      NVARCHAR(30)     NOT NULL DEFAULT 'General' CHECK (NoticeType IN ('General','Emergency','Maintenance','Event','Financial','Security')),
    Priority        NVARCHAR(20)     NOT NULL DEFAULT 'Normal' CHECK (Priority IN ('Low','Normal','High','Emergency')),
    TargetRole      NVARCHAR(50)     DEFAULT 'All',
    PublishedBy     UNIQUEIDENTIFIER NOT NULL REFERENCES Users(UserID),
    PublishAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    ExpiresAt       DATETIME2,
    IsPushSent      BIT              NOT NULL DEFAULT 0,
    IsEmailSent     BIT              NOT NULL DEFAULT 0,
    AttachmentURL   NVARCHAR(500),
    IsActive        BIT              NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
GO

-- ============================================================
-- NOTIFICATION TOKENS (Push Notifications)
-- ============================================================
CREATE TABLE NotificationTokens (
    TokenID         UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
    UserID          UNIQUEIDENTIFIER NOT NULL REFERENCES Users(UserID),
    FCMToken        NVARCHAR(500)    NOT NULL,
    Platform        NVARCHAR(10)     NOT NULL CHECK (Platform IN ('ios','android','web')),
    IsActive        BIT              NOT NULL DEFAULT 1,
    UpdatedAt       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
    UNIQUE (UserID, FCMToken)
);
GO

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX IX_Users_BuildingID    ON Users(BuildingID);
CREATE INDEX IX_Users_Role          ON Users(Role);
CREATE INDEX IX_Bills_UserID        ON Bills(UserID);
CREATE INDEX IX_Bills_BuildingID    ON Bills(BuildingID);
CREATE INDEX IX_Bills_Status        ON Bills(PaymentStatus);
CREATE INDEX IX_Bills_DueDate       ON Bills(DueDate);
CREATE INDEX IX_Visitors_BuildingID ON Visitors(BuildingID);
CREATE INDEX IX_Visitors_Status     ON Visitors(Status);
CREATE INDEX IX_Complaints_Status   ON Complaints(Status);
CREATE INDEX IX_Complaints_BuildingID ON Complaints(BuildingID);
CREATE INDEX IX_Notices_BuildingID  ON Notices(BuildingID);
CREATE INDEX IX_PollVotes_PollID    ON PollVotes(PollID);
GO

-- ============================================================
-- SEED: Super Admin
-- Password: Admin@123 (bcrypt hash)
-- ============================================================
INSERT INTO Users (UserID, Email, PasswordHash, FullName, Role, IsActive, IsVerified)
VALUES (
    NEWID(),
    'superadmin@bms.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TsG.Z6HVuNHRFKhH8mVFkT.Kfn7e',
    'Super Administrator',
    'SuperAdmin',
    1,
    1
);
GO

PRINT 'BMS Database Schema created successfully!';
GO
