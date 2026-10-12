"""Topic taxonomy for customer feedback.

Built by reading every unique review in the Build Battle dataset. Each topic has
regex rules, a polarity, a base severity (1 to 5, how much harm the customer
suffers) and the action a business would take. Rules are checked in order, so
the most specific and most harmful topics come first.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Topic:
    id: str
    label: str
    category: str
    polarity: str  # complaint | praise | other
    severity: int
    patterns: tuple[str, ...]
    owner: str = ""
    why: str = ""  # why it hurts the business, one sentence
    actions: tuple[str, ...] = field(default_factory=tuple)


FRAUD = "Fraud and Scam"
OPS = "Operational Issues"
PRODUCT = "Product Feedback"
SUPPORT = "Customer Service"

# Praise rules that must win before complaint keywords match ("No fraudulent activity")
EARLY_PRAISE: tuple[Topic, ...] = (
    Topic(
        "safe_transaction", "Safe, transparent transactions", FRAUD, "praise", 0,
        (r"\bno (signs of )?fraud", r"not a victim of fraud", r"no fraudulent"),
    ),
)

COMPLAINTS: tuple[Topic, ...] = (
    Topic(
        "double_charge", "Charged more than once", FRAUD, "complaint", 5,
        (r"charged multiple times", r"charged twice", r"double charg", r"charged .* times", r"charged two times",
         r"charged (me )?again", r"duplicate (charge|payment)"),
        owner="Payments",
        why="Customers lose money directly, and every case turns into a refund request and a chargeback risk.",
        actions=(
            "Add idempotency keys to the payment flow so a retried checkout cannot charge twice",
            "Run a daily job that finds duplicate charges and refunds them automatically",
            "Email affected customers before they have to raise a ticket",
        ),
    ),
    Topic(
        "extra_payment", "Seller asks for extra payment after the order", FRAUD, "complaint", 5,
        (r"additional payment", r"extra payment", r"asked for (more|additional) money", r"requested additional"),
        owner="Trust and safety",
        why="This is a known scam pattern. Customers pay twice and lose trust in the whole marketplace.",
        actions=(
            "Show a clear in-app warning that the platform never asks for money after checkout",
            "Detect messages from sellers that ask for payment and auto-flag those sellers",
            "Suspend repeat offenders and refund affected buyers from a protection fund",
        ),
    ),
    Topic(
        "paid_not_received", "Paid but the order never arrived", FRAUD, "complaint", 5,
        (r"never received", r"never sent", r"took my money", r"never (got|arrived)", r"did not receive",
         r"didn't receive", r"paid .*(nothing|no product)"),
        owner="Trust and safety",
        why="The customer pays and gets nothing, which is the fastest way to lose a customer for good.",
        actions=(
            "Hold payment in escrow until delivery is confirmed",
            "Require valid tracking numbers from sellers within 48 hours of an order",
            "Offer one-click refunds when tracking shows no movement for 7 days",
        ),
    ),
    Topic(
        "counterfeit", "Fake or not as advertised", FRAUD, "complaint", 4,
        (r"not as advertised", r"counterfeit", r"not authentic", r"\bfake\b", r"not related to my order",
         r"scam.*(did not function|low-quality|did not meet)", r"fraud.*(low-quality|did not meet)",
         r"(seller|scam).*low-quality"),
        owner="Marketplace quality",
        why="Misleading listings drive returns and make honest sellers look bad too.",
        actions=(
            "Verify sellers in high-risk categories before they can list",
            "Audit listings that get repeated 'not as advertised' reports",
            "Make returns free and instant for counterfeit claims",
        ),
    ),
    Topic(
        "refund_issues", "Refunds that are slow or never arrive", FRAUD, "complaint", 4,
        (r"refund", r"money back", r"reimburse"),
        owner="Payments",
        why="A slow refund keeps the customer's money locked up and turns one bad order into a lost customer.",
        actions=(
            "Publish a refund time promise and track every refund against it",
            "Refund automatically once a return is scanned, without waiting for inspection",
            "Show refund status in the order page so customers stop opening tickets",
        ),
    ),
    Topic(
        "damaged_missing", "Damaged packaging or missing items", OPS, "complaint", 4,
        (r"damaged", r"\bmissing\b", r"broken on arrival"),
        owner="Logistics",
        why="Customers pay for items they do not get in usable shape, and each case needs a reship.",
        actions=(
            "Add a weight check at packing to catch missing items before dispatch",
            "Switch fragile categories to stronger packaging",
            "Let customers report missing items with a photo for an instant reship",
        ),
    ),
    Topic(
        "wrong_items", "Wrong items delivered", OPS, "complaint", 3,
        (r"wrong item", r"processed incorrectly", r"incorrect item", r"not what i ordered"),
        owner="Fulfilment",
        why="Every wrong item costs two shipments and a return, and the customer still waits.",
        actions=(
            "Add barcode scan verification at the packing station",
            "Review order-processing logs for the steps where items get swapped",
        ),
    ),
    Topic(
        "website_issues", "Website crashes and checkout glitches", OPS, "complaint", 3,
        (r"crash", r"glitch", r"technical issue", r"website was unresponsive", r"checkout process was difficult",
         r"issues while placing my order", r"difficulties while placing", r"log(ging|s)? me out", r"\bbug",
         r"\berror\b", r"(payment|checkout|page|app) (failed|freez|won't load|does not load|keeps)",
         r"\bapp\b.*(slow|freez|crash|broken)", r"can(no|')t (log ?in|sign ?in|check ?out)"),
        owner="Engineering",
        why="When checkout breaks, customers leave without buying, so this hits revenue directly.",
        actions=(
            "Add error monitoring on the checkout flow and alert on spikes",
            "Load test the order page before sales and peak hours",
            "Save the cart so a crash does not lose the customer's progress",
        ),
    ),
    Topic(
        "delivery_delay", "Late deliveries", OPS, "complaint", 3,
        (r"delay", r"late delivery", r"delivery process had", r"took too long to arrive", r"(has|have)n'?t arrived",
         r"has not arrived", r"not (yet )?delivered", r"still waiting", r"arrived late", r"\blate\b"),
        owner="Logistics",
        why="Late orders lead to 'where is my order' tickets and cancelled repeat purchases.",
        actions=(
            "Show a realistic delivery date at checkout instead of a best case",
            "Send proactive updates when a shipment slips",
            "Review courier partners with the most delayed shipments",
        ),
    ),
    Topic(
        "defective", "Product stopped working or has defects", PRODUCT, "complaint", 4,
        (r"stopped working", r"defect", r"did not meet my expectations", r"does not meet my expectations",
         r"quality is average", r"minor issue", r"operational issue with the product", r"broke",
         r"(does|did)(n't| not) work", r"not working", r"poor quality", r"cheap(ly)? made", r"faulty"),
        owner="Product quality",
        why="Early failures turn into returns and bad reviews that scare off new buyers.",
        actions=(
            "Trace failing units back to batch and supplier",
            "Add a quality check for products that fail within the first week",
            "Offer quick replacements before customers post public reviews",
        ),
    ),
    Topic(
        "support_slow", "Long wait for support replies", SUPPORT, "complaint", 3,
        (r"wait(ed)? for a long time", r"took a long time", r"slow response", r"long wait", r"no (reply|response)",
         r"never (replied|responded|got back)", r"on hold for"),
        owner="Customer support",
        why="Slow replies turn small problems into angry customers and repeat contacts.",
        actions=(
            "Set a first-reply target and track it daily",
            "Add self-serve answers for the most common questions",
            "Route fraud and payment tickets to the front of the queue",
        ),
    ),
    Topic(
        "support_unresolved", "Support leaves issues unresolved", SUPPORT, "complaint", 4,
        (r"\bunresolved\b", r"not helpful", r"\bunhelpful\b", r"\bunresponsive\b", r"terrible experience",
         r"disappointed", r"\brude\b", r"(support|agent|customer service).*(useless|ignored|no help)"),
        owner="Customer support",
        why="Customers who contact support and still have the problem are the most likely to leave.",
        actions=(
            "Track whether tickets are actually solved, not just closed",
            "Give agents the power to refund or reship without escalation",
            "Follow up 48 hours after closing a ticket to check it worked",
        ),
    ),
    Topic(
        "fraud_other", "Other fraud reports", FRAUD, "complaint", 4,
        (r"fraud", r"scam"),
        owner="Trust and safety",
        why="Any fraud report needs a look, because one bad seller can affect many buyers.",
        actions=("Review flagged transactions and the sellers involved",),
    ),
)

PRAISE: tuple[Topic, ...] = (
    Topic("smooth_ordering", "Smooth ordering and on-time delivery", OPS, "praise", 0,
          (r"\bon time\b", r"hassle-free", r"ordering process was smooth", r"website.*(user-friendly|easy)")),
    Topic("support_great", "Fast, helpful support", SUPPORT, "praise", 0,
          (r"customer service", r"support (team|staff)")),
    Topic("product_design", "Design and looks", PRODUCT, "praise", 0, (r"design",)),
    Topic("product_features", "Useful, innovative features", PRODUCT, "praise", 0, (r"feature",)),
    Topic("product_performance", "Reliable performance", PRODUCT, "praise", 0, (r"performance",)),
    Topic("product_quality", "Quality and value for money", PRODUCT, "praise", 0,
          (r"quality", r"value", r"worth", r"durab", r"well-made", r"investment", r"exceed", r"product")),
)

OTHER = Topic("other", "Other feedback", "Other", "other", 2, ())

ALL_TOPICS: dict[str, Topic] = {t.id: t for t in (*EARLY_PRAISE, *COMPLAINTS, *PRAISE, OTHER)}

# A complaint that ends with something the business did right is "mixed", not plain negative
RECOVERY_CUES = (
    r"\b(but|however)\b[^.]*\b(provided|resolved|resolve|responsive|informed|transparent|compensation|"
    r"replacement|helpful|worth|updates|solution)"
)

CATEGORIES = (OPS, FRAUD, PRODUCT, SUPPORT)
