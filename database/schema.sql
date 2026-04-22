-- ============================================================
-- Building Management System (BMS) - MySQL Schema
-- USA Standard | Version 1.0
-- ============================================================

CREATE DATABASE IF NOT EXISTS BuildingManagementDB;
USE BuildingManagementDB;

-- ============================================================
-- BUILDINGS
-- ============================================================
CREATE TABLE Buildings (
    BuildingID      CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    BuildingName    VARCHAR(200)    NOT NULL,
    BuildingType    VARCHAR(50)     NOT NULL CHECK (BuildingType IN ('Commercial','Residential','Apartment')),
    Address         VARCHAR(500)    NOT NULL,
    City            VARCHAR(100)    NOT NULL,
    State           VARCHAR(50)     NOT NULL,
    ZipCode         VARCHAR(10)     NOT NULL,
    Country         VARCHAR(50)     NOT NULL DEFAULT 'USA',
    TotalFloors     INT              NOT NULL DEFAULT 1,
    TotalUnits      INT              NOT NULL DEFAULT 1,
    Phone           VARCHAR(20),
    Email           VARCHAR(200),
    LogoURL         VARCHAR(500),
    IsActive        TINYINT(1)              NOT NULL DEFAULT 1,
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- WINGS / BLOCKS
-- ============================================================
CREATE TABLE Wings (
    WingID          CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    BuildingID      CHAR(36) NOT NULL REFERENCES Buildings(BuildingID),
    WingName        VARCHAR(100)    NOT NULL,
    TotalFloors     INT              NOT NULL DEFAULT 1,
    IsActive        TINYINT(1)              NOT NULL DEFAULT 1,
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- UNITS / APARTMENTS / OFFICES
-- ============================================================
CREATE TABLE Units (
    UnitID          CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    BuildingID      CHAR(36) NOT NULL REFERENCES Buildings(BuildingID),
    WingID          CHAR(36) REFERENCES Wings(WingID),
    UnitNumber      VARCHAR(20)     NOT NULL,
    Floor           INT              NOT NULL,
    UnitType        VARCHAR(50)     NOT NULL CHECK (UnitType IN ('Apartment','Office','Shop','Penthouse')),
    AreaSqFt        DECIMAL(10,2),
    Bedrooms        INT              DEFAULT 0,
    Bathrooms       INT              DEFAULT 0,
    Status          VARCHAR(20)     NOT NULL DEFAULT 'Vacant' CHECK (Status IN ('Occupied','Vacant','Maintenance')),
    MonthlyRent     DECIMAL(12,2),
    SecurityDeposit DECIMAL(12,2),
    IsActive        TINYINT(1)              NOT NULL DEFAULT 1,
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (BuildingID, UnitNumber)
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE Users (
    UserID          CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    Email           VARCHAR(255)    NOT NULL UNIQUE,
    PasswordHash    VARCHAR(255)    NOT NULL,
    FullName        VARCHAR(200)    NOT NULL,
    Phone           VARCHAR(20),
    Role            VARCHAR(30)     NOT NULL CHECK (Role IN ('SuperAdmin','BuildingAdmin','SecurityStaff','MaintenanceStaff','CanteenStaff','Resident','Tenant')),
    BuildingID      CHAR(36) REFERENCES Buildings(BuildingID),
    UnitID          CHAR(36) REFERENCES Units(UnitID),
    ProfilePhotoURL VARCHAR(500),
    IsOwner         TINYINT(1)              NOT NULL DEFAULT 0,
    IsActive        TINYINT(1)              NOT NULL DEFAULT 1,
    IsVerified      TINYINT(1)              NOT NULL DEFAULT 0,
    VerificationToken VARCHAR(255),
    ResetToken      VARCHAR(255),
    ResetTokenExpiry DATETIME,
    LastLogin       DATETIME,
    MoveInDate      DATE,
    MoveOutDate     DATE,
    EmergencyContact VARCHAR(200),
    EmergencyPhone  VARCHAR(20),
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE AuditLogs (
    LogID           BIGINT           AUTO_INCREMENT PRIMARY KEY,
    UserID          CHAR(36) REFERENCES Users(UserID),
    Action          VARCHAR(100)    NOT NULL,
    TableName       VARCHAR(100),
    RecordID        VARCHAR(100),
    OldValues       LONGTEXT,
    NewValues       LONGTEXT,
    IPAddress       VARCHAR(50),
    UserAgent       VARCHAR(500),
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PARKING SLOTS
-- ============================================================
CREATE TABLE ParkingSlots (
    SlotID          CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    BuildingID      CHAR(36) NOT NULL REFERENCES Buildings(BuildingID),
    SlotNumber      VARCHAR(20)     NOT NULL,
    SlotType        VARCHAR(20)     NOT NULL CHECK (SlotType IN ('Car','Bike','Truck','Handicapped')),
    Level           VARCHAR(20),
    Status          VARCHAR(20)     NOT NULL DEFAULT 'Available' CHECK (Status IN ('Available','Occupied','Reserved','Maintenance')),
    AssignedToUnit  CHAR(36) REFERENCES Units(UnitID),
    MonthlyRate     DECIMAL(10,2),
    HourlyRate      DECIMAL(8,2),
    IsActive        TINYINT(1)              NOT NULL DEFAULT 1,
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (BuildingID, SlotNumber)
);

CREATE TABLE ParkingBookings (
    BookingID       CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    SlotID          CHAR(36) NOT NULL REFERENCES ParkingSlots(SlotID),
    UserID          CHAR(36) NOT NULL REFERENCES Users(UserID),
    VehicleNumber   VARCHAR(20)     NOT NULL,
    VehicleType     VARCHAR(20)     NOT NULL,
    BookingType     VARCHAR(20)     NOT NULL CHECK (BookingType IN ('Hourly','Daily','Monthly')),
    StartTime       DATETIME        NOT NULL,
    EndTime         DATETIME,
    Amount          DECIMAL(10,2),
    PaymentStatus   VARCHAR(20)     DEFAULT 'Pending' CHECK (PaymentStatus IN ('Pending','Paid','Refunded')),
    QRCode          VARCHAR(500),
    Status          VARCHAR(20)     DEFAULT 'Active' CHECK (Status IN ('Active','Completed','Cancelled')),
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- BILLING
-- ============================================================
CREATE TABLE Bills (
    BillID          CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    BuildingID      CHAR(36) NOT NULL REFERENCES Buildings(BuildingID),
    UnitID          CHAR(36) REFERENCES Units(UnitID),
    UserID          CHAR(36) REFERENCES Users(UserID),
    BillType        VARCHAR(50)     NOT NULL CHECK (BillType IN ('Maintenance','Electricity','Gas','Water','Internet','Parking','Canteen','Other')),
    BillMonth       DATE             NOT NULL,
    Amount          DECIMAL(12,2)    NOT NULL,
    TaxAmount       DECIMAL(10,2)    DEFAULT 0,
    TotalAmount     DECIMAL(12,2)    NOT NULL,
    DueDate         DATE             NOT NULL,
    FileURL         VARCHAR(500),
    Description     VARCHAR(1000),
    PaymentStatus   VARCHAR(20)     NOT NULL DEFAULT 'Pending' CHECK (PaymentStatus IN ('Pending','Paid','Overdue','Waived','Partial')),
    PaidAmount      DECIMAL(12,2)    DEFAULT 0,
    PaidAt          DATETIME,
    StripePaymentID VARCHAR(200),
    ReminderSentAt  DATETIME,
    Notes           VARCHAR(1000),
    CreatedBy       CHAR(36) REFERENCES Users(UserID),
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE PaymentTransactions (
    TransactionID   CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    BillID          CHAR(36) NOT NULL REFERENCES Bills(BillID),
    UserID          CHAR(36) NOT NULL REFERENCES Users(UserID),
    Amount          DECIMAL(12,2)    NOT NULL,
    PaymentMethod   VARCHAR(30)     NOT NULL CHECK (PaymentMethod IN ('Stripe','PayPal','ACH','Cash','Check')),
    TransactionRef  VARCHAR(200)    NOT NULL,
    Status          VARCHAR(20)     NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','Success','Failed','Refunded')),
    GatewayResponse LONGTEXT,
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- VISITORS
-- ============================================================
CREATE TABLE Visitors (
    VisitorID       CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    BuildingID      CHAR(36) NOT NULL REFERENCES Buildings(BuildingID),
    ResidentID      CHAR(36) NOT NULL REFERENCES Users(UserID),
    UnitID          CHAR(36) REFERENCES Units(UnitID),
    VisitorName     VARCHAR(200)    NOT NULL,
    VisitorPhone    VARCHAR(20),
    VisitorEmail    VARCHAR(255),
    IDType          VARCHAR(30),
    IDNumber        VARCHAR(50),
    Purpose         VARCHAR(200),
    VisitorType     VARCHAR(30)     DEFAULT 'Personal' CHECK (VisitorType IN ('Personal','Delivery','Service','Business','Emergency')),
    ExpectedArrival DATETIME,
    CheckInTime     DATETIME,
    CheckOutTime    DATETIME,
    QRCode          VARCHAR(500),
    OTP             VARCHAR(10),
    OTPExpiry       DATETIME,
    PhotoURL        VARCHAR(500),
    ApprovedBy      CHAR(36) REFERENCES Users(UserID),
    Status          VARCHAR(20)     NOT NULL DEFAULT 'Expected' CHECK (Status IN ('Expected','CheckedIn','CheckedOut','Denied','Cancelled')),
    VehicleNumber   VARCHAR(20),
    Notes           VARCHAR(500),
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- CANTEEN / FOOD
-- ============================================================
CREATE TABLE CanteenMenus (
    MenuID          CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    BuildingID      CHAR(36) NOT NULL REFERENCES Buildings(BuildingID),
    ItemName        VARCHAR(200)    NOT NULL,
    Description     VARCHAR(500),
    Category        VARCHAR(50)     NOT NULL CHECK (Category IN ('Breakfast','Lunch','Dinner','Snacks','Beverages')),
    Price           DECIMAL(10,2)    NOT NULL,
    ImageURL        VARCHAR(500),
    IsVegetarian    TINYINT(1)              NOT NULL DEFAULT 0,
    IsAvailable     TINYINT(1)              NOT NULL DEFAULT 1,
    DayOfWeek       VARCHAR(100),
    AvailableFrom   TIME,
    AvailableTo     TIME,
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE CanteenOrders (
    OrderID         CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    BuildingID      CHAR(36) NOT NULL REFERENCES Buildings(BuildingID),
    UserID          CHAR(36) NOT NULL REFERENCES Users(UserID),
    UnitID          CHAR(36) REFERENCES Units(UnitID),
    OrderDate       DATE             NOT NULL DEFAULT (CURRENT_DATE),
    DeliveryTime    TIME,
    TotalAmount     DECIMAL(10,2)    NOT NULL,
    PaymentStatus   VARCHAR(20)     DEFAULT 'Pending' CHECK (PaymentStatus IN ('Pending','Paid','Failed')),
    OrderStatus     VARCHAR(30)     NOT NULL DEFAULT 'Placed' CHECK (OrderStatus IN ('Placed','Confirmed','Preparing','Ready','Delivered','Cancelled')),
    SpecialInstructions VARCHAR(500),
    IsSubscription  TINYINT(1)              NOT NULL DEFAULT 0,
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE CanteenOrderItems (
    ItemID          CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    OrderID         CHAR(36) NOT NULL REFERENCES CanteenOrders(OrderID),
    MenuID          CHAR(36) NOT NULL REFERENCES CanteenMenus(MenuID),
    Quantity        INT              NOT NULL,
    UnitPrice       DECIMAL(10,2)    NOT NULL,
    TotalPrice      DECIMAL(10,2)    NOT NULL
);

-- ============================================================
-- COMPLAINTS / MAINTENANCE
-- ============================================================
CREATE TABLE Complaints (
    ComplaintID     CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    BuildingID      CHAR(36) NOT NULL REFERENCES Buildings(BuildingID),
    UnitID          CHAR(36) REFERENCES Units(UnitID),
    RaisedBy        CHAR(36) NOT NULL REFERENCES Users(UserID),
    AssignedTo      CHAR(36) REFERENCES Users(UserID),
    Category        VARCHAR(50)     NOT NULL CHECK (Category IN ('Plumbing','Electrical','Carpentry','Cleaning','Security','Elevator','AC','Internet','Other')),
    Title           VARCHAR(300)    NOT NULL,
    Description     VARCHAR(2000)   NOT NULL,
    Priority        VARCHAR(20)     NOT NULL DEFAULT 'Medium' CHECK (Priority IN ('Low','Medium','High','Emergency')),
    Status          VARCHAR(30)     NOT NULL DEFAULT 'Open' CHECK (Status IN ('Open','Assigned','InProgress','OnHold','Resolved','Closed','Rejected')),
    PhotoURL        VARCHAR(500),
    ResolutionNotes VARCHAR(2000),
    SLADeadline     DATETIME,
    ResolvedAt      DATETIME,
    RatingByResident INT             CHECK (RatingByResident BETWEEN 1 AND 5),
    FeedbackComment VARCHAR(500),
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ComplaintUpdates (
    UpdateID        CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    ComplaintID     CHAR(36) NOT NULL REFERENCES Complaints(ComplaintID),
    UpdatedBy       CHAR(36) NOT NULL REFERENCES Users(UserID),
    StatusChange    VARCHAR(30),
    Comment         VARCHAR(1000)   NOT NULL,
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- VOTING / POLLS
-- ============================================================
CREATE TABLE Polls (
    PollID          CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    BuildingID      CHAR(36) NOT NULL REFERENCES Buildings(BuildingID),
    Title           VARCHAR(300)    NOT NULL,
    Description     VARCHAR(2000),
    CreatedBy       CHAR(36) NOT NULL REFERENCES Users(UserID),
    StartDate       DATETIME        NOT NULL,
    EndDate         DATETIME        NOT NULL,
    IsAnonymous     TINYINT(1)              NOT NULL DEFAULT 0,
    IsMultiChoice   TINYINT(1)              NOT NULL DEFAULT 0,
    Status          VARCHAR(20)     NOT NULL DEFAULT 'Active' CHECK (Status IN ('Draft','Active','Closed','Cancelled')),
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE PollOptions (
    OptionID        CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    PollID          CHAR(36) NOT NULL REFERENCES Polls(PollID),
    OptionText      VARCHAR(500)    NOT NULL,
    DisplayOrder    INT              NOT NULL DEFAULT 0
);

CREATE TABLE PollVotes (
    VoteID          CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    PollID          CHAR(36) NOT NULL REFERENCES Polls(PollID),
    OptionID        CHAR(36) NOT NULL REFERENCES PollOptions(OptionID),
    VotedBy         CHAR(36) NOT NULL REFERENCES Users(UserID),
    VotedAt         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (PollID, OptionID, VotedBy)
);

-- ============================================================
-- NOTICES / COMMUNICATIONS
-- ============================================================
CREATE TABLE Notices (
    NoticeID        CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    BuildingID      CHAR(36) REFERENCES Buildings(BuildingID),
    Title           VARCHAR(300)    NOT NULL,
    Content         LONGTEXT    NOT NULL,
    NoticeType      VARCHAR(30)     NOT NULL DEFAULT 'General' CHECK (NoticeType IN ('General','Emergency','Maintenance','Event','Financial','Security')),
    Priority        VARCHAR(20)     NOT NULL DEFAULT 'Normal' CHECK (Priority IN ('Low','Normal','High','Emergency')),
    TargetRole      VARCHAR(50)     DEFAULT 'All',
    PublishedBy     CHAR(36) NOT NULL REFERENCES Users(UserID),
    PublishAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ExpiresAt       DATETIME,
    IsPushSent      TINYINT(1)              NOT NULL DEFAULT 0,
    IsEmailSent     TINYINT(1)              NOT NULL DEFAULT 0,
    AttachmentURL   VARCHAR(500),
    IsActive        TINYINT(1)              NOT NULL DEFAULT 1,
    CreatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- NOTIFICATION TOKENS (Push Notifications)
-- ============================================================
CREATE TABLE NotificationTokens (
    TokenID         CHAR(36) DEFAULT (UUID()) PRIMARY KEY,
    UserID          CHAR(36) NOT NULL REFERENCES Users(UserID),
    FCMToken        VARCHAR(500)    NOT NULL,
    Platform        VARCHAR(10)     NOT NULL CHECK (Platform IN ('ios','android','web')),
    IsActive        TINYINT(1)              NOT NULL DEFAULT 1,
    UpdatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (UserID, FCMToken)
);

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

-- ============================================================
-- SEED: Super Admin
-- Password: Admin@123 (bcrypt hash)
-- ============================================================
INSERT INTO Users (UserID, Email, PasswordHash, FullName, Role, IsActive, IsVerified)
VALUES (
    UUID(),
    'superadmin@bms.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TsG.Z6HVuNHRFKhH8mVFkT.Kfn7e',
    'Super Administrator',
    'SuperAdmin',
    1,
    1
);

PRINT 'BMS Database Schema created successfully!';
