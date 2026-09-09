// The content model behind Screen Inventory §2.0, the public (pre-auth) surface.
//
// These types are hand-written; the DATA that fills them is generated into
// GeneratedPublicContent.kt from web/content/public/*.ts by
// `npm run generate:public-content`. web/ stays the single source of truth for the curated
// catalog and the marketing copy, and CI fails if the generated file is stale — so the two
// platforms cannot drift the way check_copy_parity.py exists to catch elsewhere.
//
// Do not hand-edit the generated file. Edit the TypeScript and regenerate.
package com.storytail.adventures.content.public

/** Money follows CLAUDE.md rule 5: integer cents plus a three-letter currency code. */
data class Money(val amountCents: Long, val currency: String = "USD")

/** Topic landing pages (2.0.8–2.0.10). */
enum class Topic { CARIBBEAN, CRUISES, HONEYMOONS }

/** Filter rail "Trip type" (2.0.4). */
enum class TripType { ALL_INCLUSIVE, CRUISE, HOTEL, TOUR }

/** Filter rail "Vibe" (2.0.4). */
enum class Vibe {
    ADULTS_ONLY, FAMILY, HONEYMOON, FIVE_STAR, COUPLES, GROUP, BOUTIQUE, ADVENTURE
}

/**
 * Gyasi's rough range chip on tiles — categorical, not a price.
 *
 * [dots] is what the UI draws: MPriceRange fills one, two or three glyphs rather than
 * printing the string, so the chip reads the same at any type size.
 */
enum class PriceBand(val label: String, val dots: Int) {
    ONE("$", 1), TWO("$$", 2), THREE("$$$", 3)
}

/**
 * A photograph in the design's registry.
 *
 * [licensed] is carried through from web/lib/images.ts deliberately. Every §2.0 photo is
 * an unlicensed Unsplash placeholder today, and the web build has a strict production gate
 * that refuses to ship while that is true. The mobile app has no image loader and bundles
 * no photography for exactly that reason — see PublicPhoto, which renders the brand scrim
 * these keys will eventually tint.
 */
data class RegisteredImage(val key: String, val alt: String, val licensed: Boolean)

data class Island(val slug: String, val name: String, val imageKey: String)

data class CruiseLine(val slug: String, val name: String)

data class TripHighlight(val icon: String, val text: String)

/**
 * How a trip appears on one topic page. The same resort carries different taglines and
 * overlines on Caribbean vs Honeymoons, so a placement can override the defaults.
 */
data class TopicPlacement(
    val order: Int,
    val overline: String? = null,
    val tagline: String? = null,
    val badge: String? = null,
)

data class Destination(val place: String, val region: String, val island: String? = null)

data class Trip(
    val slug: String,
    val name: String,
    val tagline: String,
    val overline: String,
    val type: TripType,
    val vibes: List<Vibe>,
    val topics: Map<Topic, TopicPlacement>,
    val destination: Destination,
    val nights: Int? = null,
    val band: PriceBand,
    val from: Money,
    val priceAsOf: String,
    val pricePlaceholder: Boolean,
    val priceNote: String,
    val badge: String? = null,
    val imageKey: String,
    val heroImageKey: String? = null,
    val description: String,
    val highlights: List<TripHighlight>,
    val sampleItinerary: List<String>,
    val line: String? = null,
) {
    /** The overline this trip shows on [topic]'s grid, falling back to its own. */
    fun overlineFor(topic: Topic?): String =
        topic?.let { topics[it]?.overline } ?: overline

    /** The tagline this trip shows on [topic]'s grid, falling back to its own. */
    fun taglineFor(topic: Topic?): String =
        topic?.let { topics[it]?.tagline } ?: tagline

    /** The badge this trip shows on [topic]'s grid, falling back to its own. */
    fun badgeFor(topic: Topic?): String? =
        topic?.let { topics[it]?.badge } ?: badge
}

data class InspirationQuery(
    val topic: Topic? = null,
    val type: TripType? = null,
    val vibe: Vibe? = null,
    val dest: String? = null,
)

data class InspirationTile(
    val slug: String,
    val title: String,
    val imageKey: String,
    val query: InspirationQuery,
)

data class FaqItem(val q: String, val a: String)

enum class LegalSlug { PRIVACY, TERMS, COOKIES, ACCESSIBILITY }

data class LegalSection(
    val heading: String,
    val paragraphs: List<String>,
    val bullets: List<String> = emptyList(),
)

data class LegalDoc(
    val slug: LegalSlug,
    val title: String,
    val navLabel: String,
    val description: String,
    val lastUpdated: String,
    val status: String,
    val sections: List<LegalSection>,
) {
    val isDraft: Boolean get() = status == "draft"
}

/**
 * A marketing claim about Gyasi's business that must be verified before production.
 *
 * Mirrors web/content/public/proof.ts. [verified] false means the figure is a placeholder;
 * the web build refuses a strict production build while any claim on a rendered page is
 * unverified, and the app surfaces the same banner rather than quietly presenting a number
 * nobody has checked.
 */
data class Claim(
    val id: String,
    val display: String,
    val detail: String? = null,
    val verified: Boolean,
)

data class Testimonial(
    val quote: String,
    val who: String,
    val trip: String,
    val initials: String,
    val consented: Boolean,
)

/** A destination in the app's public surface, as the nav and footer name it. */
data class PublicNavLink(val route: String, val label: String)

/** Everything the §2.0 screens read. Generated; see the file header. */
object PublicContent {
    /** Trips that appear on [topic]'s grid, in that page's placement order. */
    fun tripsFor(topic: Topic): List<Trip> =
        PublicCatalog.TRIPS
            .filter { topic in it.topics }
            .sortedBy { it.topics.getValue(topic).order }

    fun tripBySlug(slug: String): Trip? = PublicCatalog.TRIPS.firstOrNull { it.slug == slug }

    fun legalBySlug(slug: LegalSlug): LegalDoc? =
        PublicCatalog.LEGAL_DOCS.firstOrNull { it.slug == slug }

    /** How many catalog trips an inspiration tile's query matches, for its "N active" line. */
    fun countFor(query: InspirationQuery): Int = PublicCatalog.TRIPS.count { trip ->
        (query.topic == null || query.topic in trip.topics) &&
            (query.type == null || trip.type == query.type) &&
            (query.vibe == null || query.vibe in trip.vibes) &&
            (query.dest == null || trip.destination.region.contains(query.dest, ignoreCase = true))
    }

    /**
     * True while any claim on the public surface is still a placeholder.
     *
     * Drives the same banner the web renders from PUBLIC_CLAIMS_MODE. Never suppress it in
     * a release build without Gyasi verifying the underlying figures — see
     * web/content/public/proof.ts.
     */
    val hasUnverifiedClaims: Boolean get() = PublicCatalog.CLAIMS.any { !it.verified }
}
