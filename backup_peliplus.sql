--
-- PostgreSQL database dump
--

\restrict iMQsezOYnfcEPzasd30ITlMsAG3NaDlrY9NapsrRjj7Dvz49YLS3AqG7qyQ6AUp

-- Dumped from database version 15.17
-- Dumped by pg_dump version 15.17

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AdPosition; Type: TYPE; Schema: public; Owner: peliplus
--

CREATE TYPE public."AdPosition" AS ENUM (
    'PRE_ROLL',
    'MID_ROLL'
);


ALTER TYPE public."AdPosition" OWNER TO peliplus;

--
-- Name: AdType; Type: TYPE; Schema: public; Owner: peliplus
--

CREATE TYPE public."AdType" AS ENUM (
    'VIDEO',
    'IMAGE'
);


ALTER TYPE public."AdType" OWNER TO peliplus;

--
-- Name: CommentStatus; Type: TYPE; Schema: public; Owner: peliplus
--

CREATE TYPE public."CommentStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE public."CommentStatus" OWNER TO peliplus;

--
-- Name: ContentStatus; Type: TYPE; Schema: public; Owner: peliplus
--

CREATE TYPE public."ContentStatus" AS ENUM (
    'UPLOADING',
    'PROCESSING',
    'READY',
    'ERROR',
    'DRAFT',
    'ACTIVE',
    'INACTIVE',
    'UPCOMING',
    'PENDING'
);


ALTER TYPE public."ContentStatus" OWNER TO peliplus;

--
-- Name: ContentType; Type: TYPE; Schema: public; Owner: peliplus
--

CREATE TYPE public."ContentType" AS ENUM (
    'MOVIE',
    'SERIES',
    'DOCUMENTARY',
    'ANIME',
    'NOVELA',
    'SHORT',
    'BIOGRAPHY'
);


ALTER TYPE public."ContentType" OWNER TO peliplus;

--
-- Name: ProcessingStatus; Type: TYPE; Schema: public; Owner: peliplus
--

CREATE TYPE public."ProcessingStatus" AS ENUM (
    'PENDING',
    'QUEUED',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
);


ALTER TYPE public."ProcessingStatus" OWNER TO peliplus;

--
-- Name: ThumbnailType; Type: TYPE; Schema: public; Owner: peliplus
--

CREATE TYPE public."ThumbnailType" AS ENUM (
    'POSTER',
    'BACKDROP',
    'PREVIEW',
    'LOGO',
    'STILL'
);


ALTER TYPE public."ThumbnailType" OWNER TO peliplus;

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: peliplus
--

CREATE TYPE public."UserRole" AS ENUM (
    'GUEST',
    'REGISTERED',
    'MEMBER',
    'ADMIN'
);


ALTER TYPE public."UserRole" OWNER TO peliplus;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: actors; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.actors (
    id text NOT NULL,
    name text NOT NULL,
    "photoUrl" text,
    "birthDate" timestamp(3) without time zone,
    nationality text,
    biography text,
    "tmdbId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.actors OWNER TO peliplus;

--
-- Name: ad_targets; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.ad_targets (
    "adId" text NOT NULL,
    "contentId" text NOT NULL
);


ALTER TABLE public.ad_targets OWNER TO peliplus;

--
-- Name: ads; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.ads (
    id text NOT NULL,
    name text NOT NULL,
    type public."AdType" NOT NULL,
    "fileUrl" text NOT NULL,
    "linkUrl" text,
    "position" public."AdPosition" NOT NULL,
    "midRollSec" integer,
    "skipAfterSec" integer DEFAULT 5 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "targetAll" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.ads OWNER TO peliplus;

--
-- Name: age_ratings; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.age_ratings (
    id text NOT NULL,
    code text NOT NULL,
    label text NOT NULL
);


ALTER TABLE public.age_ratings OWNER TO peliplus;

--
-- Name: audio_tracks; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.audio_tracks (
    id text NOT NULL,
    "videoFileId" text NOT NULL,
    language text NOT NULL,
    label text NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "trackIndex" integer NOT NULL,
    codec text DEFAULT 'aac'::text NOT NULL
);


ALTER TABLE public.audio_tracks OWNER TO peliplus;

--
-- Name: comments; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.comments (
    id text NOT NULL,
    "parentId" text,
    body text NOT NULL,
    status public."CommentStatus" DEFAULT 'PENDING'::public."CommentStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "contentId" text NOT NULL,
    "profileId" text NOT NULL
);


ALTER TABLE public.comments OWNER TO peliplus;

--
-- Name: content_actors; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.content_actors (
    "contentId" text NOT NULL,
    "actorId" text NOT NULL,
    "character" text,
    "order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.content_actors OWNER TO peliplus;

--
-- Name: content_directors; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.content_directors (
    "contentId" text NOT NULL,
    "directorId" text NOT NULL
);


ALTER TABLE public.content_directors OWNER TO peliplus;

--
-- Name: content_genres; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.content_genres (
    "contentId" text NOT NULL,
    "genreId" text NOT NULL
);


ALTER TABLE public.content_genres OWNER TO peliplus;

--
-- Name: content_tags; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.content_tags (
    "contentId" text NOT NULL,
    "tagId" text NOT NULL
);


ALTER TABLE public.content_tags OWNER TO peliplus;

--
-- Name: content_translations; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.content_translations (
    id text NOT NULL,
    "contentId" text NOT NULL,
    language text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    tagline text
);


ALTER TABLE public.content_translations OWNER TO peliplus;

--
-- Name: contents; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.contents (
    id text NOT NULL,
    type public."ContentType" NOT NULL,
    status public."ContentStatus" DEFAULT 'DRAFT'::public."ContentStatus" NOT NULL,
    slug text NOT NULL,
    "releaseYear" integer,
    duration integer,
    rating double precision,
    "reviewCount" integer DEFAULT 0 NOT NULL,
    "viewCount" bigint DEFAULT 0 NOT NULL,
    "downloadCount" bigint DEFAULT 0 NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    country text,
    languages text[],
    "subtitleLangs" text[],
    "trailerUrl" text,
    "rentalPrice" numeric(10,2),
    "isFreeWithMembership" boolean DEFAULT true NOT NULL,
    "downloadAllowed" boolean DEFAULT false NOT NULL,
    "tmdbId" text,
    "imdbId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "ageRatingId" text,
    "platformId" text
);


ALTER TABLE public.contents OWNER TO peliplus;

--
-- Name: directors; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.directors (
    id text NOT NULL,
    name text NOT NULL,
    "photoUrl" text,
    "birthDate" timestamp(3) without time zone,
    nationality text,
    biography text,
    "tmdbId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.directors OWNER TO peliplus;

--
-- Name: episode_translations; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.episode_translations (
    id text NOT NULL,
    "episodeId" text NOT NULL,
    language text NOT NULL,
    title text NOT NULL,
    description text
);


ALTER TABLE public.episode_translations OWNER TO peliplus;

--
-- Name: episodes; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.episodes (
    id text NOT NULL,
    "seasonId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    duration integer,
    number integer NOT NULL
);


ALTER TABLE public.episodes OWNER TO peliplus;

--
-- Name: favorites; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.favorites (
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "contentId" text NOT NULL,
    "profileId" text NOT NULL
);


ALTER TABLE public.favorites OWNER TO peliplus;

--
-- Name: genres; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.genres (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    icon text
);


ALTER TABLE public.genres OWNER TO peliplus;

--
-- Name: my_list; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.my_list (
    "profileId" text NOT NULL,
    "contentId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.my_list OWNER TO peliplus;

--
-- Name: plans; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.plans (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    "durationDays" integer NOT NULL,
    "maxDevices" integer DEFAULT 1 NOT NULL,
    "hasHd" boolean DEFAULT true NOT NULL,
    has4k boolean DEFAULT false NOT NULL,
    "allowDownload" boolean DEFAULT false NOT NULL,
    "noAds" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.plans OWNER TO peliplus;

--
-- Name: platforms; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.platforms (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    "logoUrl" text,
    "isFeatured" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.platforms OWNER TO peliplus;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.profiles (
    id text NOT NULL,
    "userId" text NOT NULL,
    name text NOT NULL,
    avatar text,
    "isKids" boolean DEFAULT false NOT NULL,
    pin text,
    language text DEFAULT 'es'::text NOT NULL,
    "preferredTheme" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.profiles OWNER TO peliplus;

--
-- Name: recommendation_items; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.recommendation_items (
    id text NOT NULL,
    "contentId" text NOT NULL,
    score double precision NOT NULL,
    reason text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.recommendation_items OWNER TO peliplus;

--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.refresh_tokens (
    id text NOT NULL,
    token text NOT NULL,
    "userId" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.refresh_tokens OWNER TO peliplus;

--
-- Name: rentals; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.rentals (
    id text NOT NULL,
    "userId" text NOT NULL,
    "pricePaid" numeric(10,2) NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "paymentRef" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "contentId" text NOT NULL
);


ALTER TABLE public.rentals OWNER TO peliplus;

--
-- Name: reviews; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.reviews (
    id text NOT NULL,
    "profileId" text NOT NULL,
    "contentId" text NOT NULL,
    rating double precision NOT NULL,
    title text,
    body text,
    language text DEFAULT 'es'::text NOT NULL,
    likes integer DEFAULT 0 NOT NULL,
    "isHidden" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.reviews OWNER TO peliplus;

--
-- Name: season_translations; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.season_translations (
    id text NOT NULL,
    "seasonId" text NOT NULL,
    language text NOT NULL,
    title text NOT NULL,
    description text
);


ALTER TABLE public.season_translations OWNER TO peliplus;

--
-- Name: seasons; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.seasons (
    id text NOT NULL,
    "posterUrl" text,
    "contentId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    number integer NOT NULL,
    year integer
);


ALTER TABLE public.seasons OWNER TO peliplus;

--
-- Name: site_config; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.site_config (
    key text NOT NULL,
    value text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.site_config OWNER TO peliplus;

--
-- Name: subtitle_tracks; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.subtitle_tracks (
    id text NOT NULL,
    "videoFileId" text NOT NULL,
    language text NOT NULL,
    label text NOT NULL,
    format text DEFAULT 'vtt'::text NOT NULL,
    url text NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "isForced" boolean DEFAULT false NOT NULL
);


ALTER TABLE public.subtitle_tracks OWNER TO peliplus;

--
-- Name: tags; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.tags (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL
);


ALTER TABLE public.tags OWNER TO peliplus;

--
-- Name: thumbnails; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.thumbnails (
    id text NOT NULL,
    "contentId" text,
    "episodeId" text,
    type public."ThumbnailType" NOT NULL,
    url text NOT NULL,
    width integer,
    height integer
);


ALTER TABLE public.thumbnails OWNER TO peliplus;

--
-- Name: uploads; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.uploads (
    id text NOT NULL,
    "originalName" text NOT NULL,
    "storedName" text NOT NULL,
    "mimeType" text NOT NULL,
    "sizeBytes" bigint NOT NULL,
    path text NOT NULL,
    "uploadedBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.uploads OWNER TO peliplus;

--
-- Name: user_memberships; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.user_memberships (
    id text NOT NULL,
    "userId" text NOT NULL,
    "planId" text NOT NULL,
    "startsAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.user_memberships OWNER TO peliplus;

--
-- Name: users; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text,
    name text,
    role public."UserRole" DEFAULT 'REGISTERED'::public."UserRole" NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "googleId" text,
    "appleId" text,
    "preferredLang" text DEFAULT 'es'::text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


ALTER TABLE public.users OWNER TO peliplus;

--
-- Name: video_files; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.video_files (
    id text NOT NULL,
    "contentId" text,
    "episodeId" text,
    status public."ProcessingStatus" DEFAULT 'PENDING'::public."ProcessingStatus" NOT NULL,
    "originalPath" text NOT NULL,
    "hlsPath" text,
    "masterPlaylist" text,
    duration integer,
    "fileSize" bigint,
    "errorMessage" text,
    "processingJobId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.video_files OWNER TO peliplus;

--
-- Name: video_qualities; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.video_qualities (
    id text NOT NULL,
    "videoFileId" text NOT NULL,
    resolution text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    bitrate integer NOT NULL,
    "playlistUrl" text NOT NULL,
    codec text DEFAULT 'h264'::text NOT NULL
);


ALTER TABLE public.video_qualities OWNER TO peliplus;

--
-- Name: watch_history; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.watch_history (
    id text NOT NULL,
    "watchedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    "contentId" text,
    duration integer,
    "episodeId" text,
    "profileId" text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.watch_history OWNER TO peliplus;

--
-- Name: watch_sessions; Type: TABLE; Schema: public; Owner: peliplus
--

CREATE TABLE public.watch_sessions (
    id text NOT NULL,
    "profileId" text NOT NULL,
    "videoFileId" text NOT NULL,
    quality text NOT NULL,
    "audioLang" text NOT NULL,
    "subtitleLang" text,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endedAt" timestamp(3) without time zone,
    "ipAddress" text,
    "userAgent" text
);


ALTER TABLE public.watch_sessions OWNER TO peliplus;

--
-- Data for Name: actors; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.actors (id, name, "photoUrl", "birthDate", nationality, biography, "tmdbId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: ad_targets; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.ad_targets ("adId", "contentId") FROM stdin;
\.


--
-- Data for Name: ads; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.ads (id, name, type, "fileUrl", "linkUrl", "position", "midRollSec", "skipAfterSec", "isActive", "targetAll", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: age_ratings; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.age_ratings (id, code, label) FROM stdin;
cmokp4xz1000gu22ldtk508tr	PG-13	Mayores de 13 años
\.


--
-- Data for Name: audio_tracks; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.audio_tracks (id, "videoFileId", language, label, "isDefault", "trackIndex", codec) FROM stdin;
\.


--
-- Data for Name: comments; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.comments (id, "parentId", body, status, "createdAt", "updatedAt", "contentId", "profileId") FROM stdin;
\.


--
-- Data for Name: content_actors; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.content_actors ("contentId", "actorId", "character", "order") FROM stdin;
\.


--
-- Data for Name: content_directors; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.content_directors ("contentId", "directorId") FROM stdin;
\.


--
-- Data for Name: content_genres; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.content_genres ("contentId", "genreId") FROM stdin;
cmokp4xzb000iu22ly434qh3n	cmokp4xx60008u22la68gnzzo
cmokp4xzs000nu22lc30kmjm8	cmokp4xxf0009u22lrur8n8oo
cmokp4y09000su22ljernh2yi	cmokp4xxn000au22lhwb3lht2
cmokp4y0p000xu22lssz2clp6	cmokp4xxw000bu22l7xa3vk0j
cmokp4y150012u22l8a86hr8j	cmokp4xy4000cu22lsrdkpe22
cmokp4y1d0017u22ltx8xwjjh	cmokp4xyc000du22lu9liz9uc
cmom3ppu20003901yiuqla343	cmokp4xx60008u22la68gnzzo
cmom3ppu20003901yiuqla343	cmokp4xy4000cu22lsrdkpe22
\.


--
-- Data for Name: content_tags; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.content_tags ("contentId", "tagId") FROM stdin;
\.


--
-- Data for Name: content_translations; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.content_translations (id, "contentId", language, title, description, tagline) FROM stdin;
cmokp4xzb000ju22l231cxzo3	cmokp4xzb000iu22ly434qh3n	es	Oppenheimer	La historia del padre de la bomba atómica...	\N
cmokp4xzs000ou22lk21vyf4t	cmokp4xzs000nu22lc30kmjm8	es	Dune: Parte Dos	Paul Atreides se une a los Fremen...	\N
cmokp4y09000tu22la3bz32so	cmokp4y09000su22ljernh2yi	es	The Last of Us	En un mundo post-apocalíptico...	\N
cmokp4y0p000yu22lkbs3wlqm	cmokp4y0p000xu22lssz2clp6	es	Spider-Man: Across the Spider-Verse	Miles Morales regresa...	\N
cmokp4y150013u22lmm4e370i	cmokp4y150012u22l8a86hr8j	es	Succession	La familia Roy, dueña del conglomerado...	\N
cmokp4y1d0018u22lj9bbpc7v	cmokp4y1d0017u22ltx8xwjjh	es	Attack on Titan	La batalla final por la humanidad...	\N
cmom52nce000614fgzxhi6s4x	cmom3ppu20003901yiuqla343	es	Los Vengadores	Cuando un enemigo inesperado surge como una gran amenaza para la seguridad mundial, Nick Fury, director de la Agencia SHIELD, decide reclutar a un equipo para salvar al mundo de un desastre casi seguro. Adaptación del cómic de Marvel "Los Vengadores", el legendario grupo de superhéroes formado por Iron Man, Hulk, Thor y el Capitán América entre otros.	\N
\.


--
-- Data for Name: contents; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.contents (id, type, status, slug, "releaseYear", duration, rating, "reviewCount", "viewCount", "downloadCount", featured, country, languages, "subtitleLangs", "trailerUrl", "rentalPrice", "isFreeWithMembership", "downloadAllowed", "tmdbId", "imdbId", "createdAt", "updatedAt", "deletedAt", "ageRatingId", "platformId") FROM stdin;
cmokp4xzb000iu22ly434qh3n	MOVIE	READY	pelicula-0	2023	120	8.5	0	3013	0	t	\N	\N	\N	\N	\N	t	f	\N	\N	2026-04-29 23:38:50.759	2026-04-29 23:38:50.759	\N	cmokp4xz1000gu22ldtk508tr	cmokp4xw20003u22l5kjsnvsl
cmokp4xzs000nu22lc30kmjm8	MOVIE	READY	pelicula-1	2023	120	8.8	0	7110	0	t	\N	\N	\N	\N	\N	t	f	\N	\N	2026-04-29 23:38:50.776	2026-04-29 23:38:50.776	\N	cmokp4xz1000gu22ldtk508tr	cmokp4xwa0004u22lh7ljhhxd
cmokp4y09000su22ljernh2yi	SERIES	READY	pelicula-2	2023	120	9	0	9999	0	t	\N	\N	\N	\N	\N	t	f	\N	\N	2026-04-29 23:38:50.792	2026-04-29 23:38:50.792	\N	cmokp4xz1000gu22ldtk508tr	cmokp4xwi0005u22lvsv7o3iu
cmokp4y0p000xu22lssz2clp6	MOVIE	READY	pelicula-3	2023	120	8.7	0	4769	0	f	\N	\N	\N	\N	\N	f	f	\N	\N	2026-04-29 23:38:50.809	2026-04-29 23:38:50.809	\N	cmokp4xz1000gu22ldtk508tr	cmokp4xwq0006u22lubronsrc
cmokp4y150012u22l8a86hr8j	SERIES	READY	pelicula-4	2023	120	8.9	0	4323	0	f	\N	\N	\N	\N	\N	t	f	\N	\N	2026-04-29 23:38:50.825	2026-04-29 23:38:50.825	\N	cmokp4xz1000gu22ldtk508tr	cmokp4xwz0007u22l0x9beeh6
cmokp4y1d0017u22ltx8xwjjh	ANIME	READY	pelicula-5	2023	120	9.1	0	3431	0	t	\N	\N	\N	\N	\N	f	f	\N	\N	2026-04-29 23:38:50.833	2026-04-29 23:38:50.833	\N	cmokp4xz1000gu22ldtk508tr	cmokp4xw20003u22l5kjsnvsl
cmom3ppu20003901yiuqla343	MOVIE	READY	the-avenger-hwij	2012	120	0	0	0	0	f	\N	\N	\N	\N	\N	t	f	\N	\N	2026-04-30 23:14:40.777	2026-04-30 23:52:43.694	\N	\N	cmokp4xwi0005u22lvsv7o3iu
\.


--
-- Data for Name: directors; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.directors (id, name, "photoUrl", "birthDate", nationality, biography, "tmdbId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: episode_translations; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.episode_translations (id, "episodeId", language, title, description) FROM stdin;
\.


--
-- Data for Name: episodes; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.episodes (id, "seasonId", "createdAt", duration, number) FROM stdin;
\.


--
-- Data for Name: favorites; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.favorites ("createdAt", "contentId", "profileId") FROM stdin;
\.


--
-- Data for Name: genres; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.genres (id, name, slug, icon) FROM stdin;
cmokp4xx60008u22la68gnzzo	Acción	acción	\N
cmokp4xxf0009u22lrur8n8oo	Comedia	comedia	\N
cmokp4xxn000au22lhwb3lht2	Drama	drama	\N
cmokp4xxw000bu22l7xa3vk0j	Terror	terror	\N
cmokp4xy4000cu22lsrdkpe22	Ciencia Ficción	ciencia-ficción	\N
cmokp4xyc000du22lu9liz9uc	Romance	romance	\N
cmokp4xyl000eu22lalx0608f	Animación	animación	\N
cmokp4xyt000fu22ldu1nof3x	Suspenso	suspenso	\N
\.


--
-- Data for Name: my_list; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.my_list ("profileId", "contentId", "createdAt") FROM stdin;
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.plans (id, name, description, price, "durationDays", "maxDevices", "hasHd", has4k, "allowDownload", "noAds", "isActive", "createdAt", "updatedAt") FROM stdin;
cmokp4xv50000u22lvrpod2xh	Básico	Perfecto para empezar	4.99	30	1	t	f	f	f	t	2026-04-29 23:38:50.609	2026-04-29 23:38:50.609
cmokp4xv50001u22l0y19eaz0	Premium	La mejor experiencia	9.99	30	3	t	t	t	t	t	2026-04-29 23:38:50.609	2026-04-29 23:38:50.609
cmokp4xv50002u22lys1xilkh	Familiar	Para toda la familia	14.99	30	5	t	t	t	t	t	2026-04-29 23:38:50.609	2026-04-29 23:38:50.609
\.


--
-- Data for Name: platforms; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.platforms (id, name, slug, "logoUrl", "isFeatured", "createdAt", "updatedAt") FROM stdin;
cmokp4xw20003u22l5kjsnvsl	Netflix	netflix	https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg	t	2026-04-29 23:38:50.643	2026-04-29 23:38:50.643
cmokp4xwa0004u22lh7ljhhxd	HBO Max	hbo-max	https://upload.wikimedia.org/wikipedia/commons/1/17/HBO_Max_Logo.svg	t	2026-04-29 23:38:50.651	2026-04-29 23:38:50.651
cmokp4xwi0005u22lvsv7o3iu	Disney+	disney-plus	https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg	t	2026-04-29 23:38:50.658	2026-04-29 23:38:50.658
cmokp4xwq0006u22lubronsrc	Prime Video	prime-video	https://upload.wikimedia.org/wikipedia/commons/1/11/Amazon_Prime_Video_logo.svg	t	2026-04-29 23:38:50.666	2026-04-29 23:38:50.666
cmokp4xwz0007u22l0x9beeh6	Paramount+	paramount-plus	https://upload.wikimedia.org/wikipedia/commons/a/a5/Paramount_Plus.svg	t	2026-04-29 23:38:50.675	2026-04-29 23:38:50.675
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.profiles (id, "userId", name, avatar, "isKids", pin, language, "preferredTheme", "createdAt") FROM stdin;
\.


--
-- Data for Name: recommendation_items; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.recommendation_items (id, "contentId", score, reason, "updatedAt") FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.refresh_tokens (id, token, "userId", "expiresAt", "createdAt") FROM stdin;
cmoj5tuga0001zbr1iv1tx2vo	85575ed4-1277-4057-beaa-7615eaf2f7fd	cmoj5ep1h0000xa0gssf09izo	2026-05-28 21:50:34.089	2026-04-28 21:50:34.09
cmoj7ava20004zbr1so7bi0cq	8290e502-2b95-4a3a-9a07-d92061203b7c	cmoj5ep1h0000xa0gssf09izo	2026-05-28 22:31:47.929	2026-04-28 22:31:47.931
cmoj7yzym0001qvhgi9ok1db6	87a29f7d-31f5-4cce-8334-b652bb192f53	cmoj5ep1h0000xa0gssf09izo	2026-05-28 22:50:33.741	2026-04-28 22:50:33.742
cmoj8149p0003qvhgnepe6mmp	18000a21-5df2-42cf-88e4-5adfbdeb0225	cmoj5ep1h0000xa0gssf09izo	2026-05-28 22:52:12.635	2026-04-28 22:52:12.638
cmoj816iq0005qvhg55qye3xc	0f70773f-62e3-4a8b-a76f-2c7b8a231cd1	cmoj5ep1h0000xa0gssf09izo	2026-05-28 22:52:15.552	2026-04-28 22:52:15.555
cmoj99qs70006wo6d4s8mmp75	a922e5e3-62a1-4143-9db3-2180015c9c98	cmoj5ep1h0000xa0gssf09izo	2026-05-28 23:26:54.65	2026-04-28 23:26:54.659
cmoj9b54x0008wo6dh2kn9yjl	4d9c374d-be6d-42e4-b438-587c6edd509f	cmoj5ep1h0000xa0gssf09izo	2026-05-28 23:27:59.937	2026-04-28 23:27:59.938
cmojakapv0001pwpywpg40ydk	b889db75-abf5-4a79-93a0-c50134d7f409	cmoj5ep1h0000xa0gssf09izo	2026-05-29 00:03:06.69	2026-04-29 00:03:06.691
cmom3ok9b0001901y0qpu38xb	44d6ed2d-4024-4736-8f27-490fe2c5d35a	cmoj5ep1h0000xa0gssf09izo	2026-05-30 23:13:46.895	2026-04-30 23:13:46.895
cmom87b620001gncffci729ag	df92e6c3-21d6-4426-9c6d-bc554dd049db	cmoj5ep1h0000xa0gssf09izo	2026-05-31 01:20:20.035	2026-05-01 01:20:20.04
cmom87b620003gncfe823qa3p	2a39ae1b-7ded-4f99-92af-b08a232980a7	cmoj5ep1h0000xa0gssf09izo	2026-05-31 01:20:20.035	2026-05-01 01:20:20.042
\.


--
-- Data for Name: rentals; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.rentals (id, "userId", "pricePaid", "expiresAt", "paymentRef", "createdAt", "contentId") FROM stdin;
\.


--
-- Data for Name: reviews; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.reviews (id, "profileId", "contentId", rating, title, body, language, likes, "isHidden", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: season_translations; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.season_translations (id, "seasonId", language, title, description) FROM stdin;
\.


--
-- Data for Name: seasons; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.seasons (id, "posterUrl", "contentId", "createdAt", number, year) FROM stdin;
\.


--
-- Data for Name: site_config; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.site_config (key, value, "updatedAt") FROM stdin;
whatsapp_number	+5491100000000	2026-04-29 23:38:50.553
faq_items	[{"question":"¿Cómo puedo suscribirme a FlexStreaming?","answer":"Puedes elegir el plan que más te convenga en la sección de planes y contactarnos por WhatsApp. Te crearemos una cuenta y podrás empezar a disfrutar de todo el contenido."},{"question":"¿Qué métodos de pago aceptan?","answer":"Aceptamos transferencias bancarias, Mercado Pago, PayPal y pagos en efectivo. Contáctanos por WhatsApp para más detalles."},{"question":"¿Puedo ver contenido gratis?","answer":"Sí, tenemos una selección de contenido gratuito disponible para todos. Solo necesitas crear una cuenta gratuita para empezar a disfrutarlo."},{"question":"¿En cuántos dispositivos puedo ver?","answer":"Depende del plan que elijas. El plan Básico permite 1 dispositivo, el Premium hasta 3 y el Familiar hasta 5 dispositivos simultáneos."}]	2026-04-29 23:38:50.553
home_banner_strategy	MANUAL	2026-05-01 01:31:55.501
home_banner_limit	5	2026-05-01 01:31:55.502
home_banner_ids	["cmom3ppu20003901yiuqla343","cmokp4y0p000xu22lssz2clp6","cmokp4xzb000iu22ly434qh3n"]	2026-05-01 01:31:55.502
\.


--
-- Data for Name: subtitle_tracks; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.subtitle_tracks (id, "videoFileId", language, label, format, url, "isDefault", "isForced") FROM stdin;
\.


--
-- Data for Name: tags; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.tags (id, name, slug) FROM stdin;
\.


--
-- Data for Name: thumbnails; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.thumbnails (id, "contentId", "episodeId", type, url, width, height) FROM stdin;
cmoj8dge00004wo6dwzz3vvw7	\N	\N	POSTER	/media/thumbnails/cmoj7sqaq0002taesqqxnsw5h/poster.jpg	1280	720
cmokp4xzb000ku22lygoc5knz	cmokp4xzb000iu22ly434qh3n	\N	BACKDROP	https://images.unsplash.com/photo-1440404653325-ab127d49abc1?q=80&w=2070	\N	\N
cmokp4xzb000lu22l40fsj9fx	cmokp4xzb000iu22ly434qh3n	\N	POSTER	https://images.unsplash.com/photo-1440404653325-ab127d49abc1?q=80&w=600	\N	\N
cmokp4xzs000pu22lgelw7d2b	cmokp4xzs000nu22lc30kmjm8	\N	BACKDROP	https://images.unsplash.com/photo-1534809027769-b00d750a6bac?q=80&w=2070	\N	\N
cmokp4xzs000qu22lvqypu8dj	cmokp4xzs000nu22lc30kmjm8	\N	POSTER	https://images.unsplash.com/photo-1534809027769-b00d750a6bac?q=80&w=600	\N	\N
cmokp4y09000uu22lh9itgjb0	cmokp4y09000su22ljernh2yi	\N	BACKDROP	https://images.unsplash.com/photo-1542204165-65bf26472b9b?q=80&w=2070	\N	\N
cmokp4y09000vu22lmetot67t	cmokp4y09000su22ljernh2yi	\N	POSTER	https://images.unsplash.com/photo-1542204165-65bf26472b9b?q=80&w=600	\N	\N
cmokp4y0p000zu22lgc08b7hu	cmokp4y0p000xu22lssz2clp6	\N	BACKDROP	https://images.unsplash.com/photo-1635805737707-575885ab0820?q=80&w=2070	\N	\N
cmokp4y0p0010u22ltzx8tj1k	cmokp4y0p000xu22lssz2clp6	\N	POSTER	https://images.unsplash.com/photo-1635805737707-575885ab0820?q=80&w=600	\N	\N
cmokp4y150014u22lxtgz9e5t	cmokp4y150012u22l8a86hr8j	\N	BACKDROP	https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2070	\N	\N
cmokp4y150015u22lv5wdhbri	cmokp4y150012u22l8a86hr8j	\N	POSTER	https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=600	\N	\N
cmokp4y1d0019u22lw7t8pp1d	cmokp4y1d0017u22ltx8xwjjh	\N	BACKDROP	https://images.unsplash.com/photo-1607604276583-c1d87e93f9e0?q=80&w=2070	\N	\N
cmokp4y1d001au22lusblsvln	cmokp4y1d0017u22ltx8xwjjh	\N	POSTER	https://images.unsplash.com/photo-1607604276583-c1d87e93f9e0?q=80&w=600	\N	\N
cmom4sqs7000114fg4twf8ab5	cmom3ppu20003901yiuqla343	\N	POSTER	/media/thumbnails/cmom3ppu20003901yiuqla343/poster-1777593158625.webp	600	900
cmom4sy01000314fgvwcp4y5d	cmom3ppu20003901yiuqla343	\N	BACKDROP	/media/thumbnails/cmom3ppu20003901yiuqla343/backdrop-1777593162257.webp	1920	1080
\.


--
-- Data for Name: uploads; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.uploads (id, "originalName", "storedName", "mimeType", "sizeBytes", path, "uploadedBy", "createdAt") FROM stdin;
\.


--
-- Data for Name: user_memberships; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.user_memberships (id, "userId", "planId", "startsAt", "expiresAt", "isActive", "createdAt") FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.users (id, email, "passwordHash", name, role, "isActive", "googleId", "appleId", "preferredLang", "createdAt", "updatedAt", "deletedAt") FROM stdin;
cmoj5ep1h0000xa0gssf09izo	admin@peliplus.com	$2b$10$wXItwPw7Of5rkoBWp2O.dOqHpg18h3S/F/ljE7E.LuBuwud0kwSOu	Admin	ADMIN	t	\N	\N	es	2026-04-28 21:38:47.237	2026-04-28 21:38:47.237	\N
\.


--
-- Data for Name: video_files; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.video_files (id, "contentId", "episodeId", status, "originalPath", "hlsPath", "masterPlaylist", duration, "fileSize", "errorMessage", "processingJobId", "createdAt", "updatedAt") FROM stdin;
cmom3q0rb0006901y063rt1n5	cmom3ppu20003901yiuqla343	\N	COMPLETED	uploads/video-1777590894594-841880843.mp4	media/hls/cmom3ppu20003901yiuqla343	/media/hls/cmom3ppu20003901yiuqla343/master.m3u8	\N	\N	\N	\N	2026-04-30 23:14:54.935	2026-04-30 23:17:55.142
cmom3tzr5000b901ye89txm81	cmom3ppu20003901yiuqla343	\N	COMPLETED	uploads/video-1777590894594-841880843.mp4	media/hls/cmom3ppu20003901yiuqla343	/media/hls/cmom3ppu20003901yiuqla343/master.m3u8	\N	\N	\N	\N	2026-04-30 23:18:00.257	2026-04-30 23:20:48.294
cmom3xtak000g901ybvum61gq	cmom3ppu20003901yiuqla343	\N	COMPLETED	uploads/video-1777590894594-841880843.mp4	media/hls/cmom3ppu20003901yiuqla343	/media/hls/cmom3ppu20003901yiuqla343/master.m3u8	\N	\N	\N	\N	2026-04-30 23:20:58.509	2026-04-30 23:23:35.957
\.


--
-- Data for Name: video_qualities; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.video_qualities (id, "videoFileId", resolution, width, height, bitrate, "playlistUrl", codec) FROM stdin;
cmom3tvt20007901ylfor4w1k	cmom3q0rb0006901y063rt1n5	720p	1280	720	2500000	/media/hls/cmom3ppu20003901yiuqla343/720p.m3u8	h264
cmom3xlev000c901ypg5cfof3	cmom3tzr5000b901ye89txm81	720p	1280	720	2500000	/media/hls/cmom3ppu20003901yiuqla343/720p.m3u8	h264
cmom416s6000h901y9jt27853	cmom3xtak000g901ybvum61gq	720p	1280	720	2500000	/media/hls/cmom3ppu20003901yiuqla343/720p.m3u8	h264
\.


--
-- Data for Name: watch_history; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.watch_history (id, "watchedAt", completed, "contentId", duration, "episodeId", "profileId", progress, "updatedAt") FROM stdin;
\.


--
-- Data for Name: watch_sessions; Type: TABLE DATA; Schema: public; Owner: peliplus
--

COPY public.watch_sessions (id, "profileId", "videoFileId", quality, "audioLang", "subtitleLang", "startedAt", "endedAt", "ipAddress", "userAgent") FROM stdin;
\.


--
-- Name: actors actors_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.actors
    ADD CONSTRAINT actors_pkey PRIMARY KEY (id);


--
-- Name: ad_targets ad_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.ad_targets
    ADD CONSTRAINT ad_targets_pkey PRIMARY KEY ("adId", "contentId");


--
-- Name: ads ads_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.ads
    ADD CONSTRAINT ads_pkey PRIMARY KEY (id);


--
-- Name: age_ratings age_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.age_ratings
    ADD CONSTRAINT age_ratings_pkey PRIMARY KEY (id);


--
-- Name: audio_tracks audio_tracks_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.audio_tracks
    ADD CONSTRAINT audio_tracks_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: content_actors content_actors_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_actors
    ADD CONSTRAINT content_actors_pkey PRIMARY KEY ("contentId", "actorId");


--
-- Name: content_directors content_directors_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_directors
    ADD CONSTRAINT content_directors_pkey PRIMARY KEY ("contentId", "directorId");


--
-- Name: content_genres content_genres_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_genres
    ADD CONSTRAINT content_genres_pkey PRIMARY KEY ("contentId", "genreId");


--
-- Name: content_tags content_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_tags
    ADD CONSTRAINT content_tags_pkey PRIMARY KEY ("contentId", "tagId");


--
-- Name: content_translations content_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_translations
    ADD CONSTRAINT content_translations_pkey PRIMARY KEY (id);


--
-- Name: contents contents_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.contents
    ADD CONSTRAINT contents_pkey PRIMARY KEY (id);


--
-- Name: directors directors_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.directors
    ADD CONSTRAINT directors_pkey PRIMARY KEY (id);


--
-- Name: episode_translations episode_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.episode_translations
    ADD CONSTRAINT episode_translations_pkey PRIMARY KEY (id);


--
-- Name: episodes episodes_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.episodes
    ADD CONSTRAINT episodes_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_pkey PRIMARY KEY ("profileId", "contentId");


--
-- Name: genres genres_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.genres
    ADD CONSTRAINT genres_pkey PRIMARY KEY (id);


--
-- Name: my_list my_list_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.my_list
    ADD CONSTRAINT my_list_pkey PRIMARY KEY ("profileId", "contentId");


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: platforms platforms_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.platforms
    ADD CONSTRAINT platforms_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: recommendation_items recommendation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.recommendation_items
    ADD CONSTRAINT recommendation_items_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: rentals rentals_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.rentals
    ADD CONSTRAINT rentals_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: season_translations season_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.season_translations
    ADD CONSTRAINT season_translations_pkey PRIMARY KEY (id);


--
-- Name: seasons seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_pkey PRIMARY KEY (id);


--
-- Name: site_config site_config_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.site_config
    ADD CONSTRAINT site_config_pkey PRIMARY KEY (key);


--
-- Name: subtitle_tracks subtitle_tracks_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.subtitle_tracks
    ADD CONSTRAINT subtitle_tracks_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: thumbnails thumbnails_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.thumbnails
    ADD CONSTRAINT thumbnails_pkey PRIMARY KEY (id);


--
-- Name: uploads uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_pkey PRIMARY KEY (id);


--
-- Name: user_memberships user_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.user_memberships
    ADD CONSTRAINT user_memberships_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: video_files video_files_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.video_files
    ADD CONSTRAINT video_files_pkey PRIMARY KEY (id);


--
-- Name: video_qualities video_qualities_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.video_qualities
    ADD CONSTRAINT video_qualities_pkey PRIMARY KEY (id);


--
-- Name: watch_history watch_history_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.watch_history
    ADD CONSTRAINT watch_history_pkey PRIMARY KEY (id);


--
-- Name: watch_sessions watch_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.watch_sessions
    ADD CONSTRAINT watch_sessions_pkey PRIMARY KEY (id);


--
-- Name: actors_name_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX actors_name_idx ON public.actors USING btree (name);


--
-- Name: actors_tmdbId_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX "actors_tmdbId_key" ON public.actors USING btree ("tmdbId");


--
-- Name: age_ratings_code_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX age_ratings_code_key ON public.age_ratings USING btree (code);


--
-- Name: audio_tracks_videoFileId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "audio_tracks_videoFileId_idx" ON public.audio_tracks USING btree ("videoFileId");


--
-- Name: comments_contentId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "comments_contentId_idx" ON public.comments USING btree ("contentId");


--
-- Name: content_translations_contentId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "content_translations_contentId_idx" ON public.content_translations USING btree ("contentId");


--
-- Name: content_translations_contentId_language_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX "content_translations_contentId_language_key" ON public.content_translations USING btree ("contentId", language);


--
-- Name: contents_featured_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX contents_featured_idx ON public.contents USING btree (featured);


--
-- Name: contents_imdbId_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX "contents_imdbId_key" ON public.contents USING btree ("imdbId");


--
-- Name: contents_slug_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX contents_slug_idx ON public.contents USING btree (slug);


--
-- Name: contents_slug_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX contents_slug_key ON public.contents USING btree (slug);


--
-- Name: contents_status_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX contents_status_idx ON public.contents USING btree (status);


--
-- Name: contents_tmdbId_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX "contents_tmdbId_key" ON public.contents USING btree ("tmdbId");


--
-- Name: contents_type_status_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX contents_type_status_idx ON public.contents USING btree (type, status);


--
-- Name: directors_name_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX directors_name_idx ON public.directors USING btree (name);


--
-- Name: directors_tmdbId_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX "directors_tmdbId_key" ON public.directors USING btree ("tmdbId");


--
-- Name: episode_translations_episodeId_language_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX "episode_translations_episodeId_language_key" ON public.episode_translations USING btree ("episodeId", language);


--
-- Name: episodes_seasonId_number_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX "episodes_seasonId_number_key" ON public.episodes USING btree ("seasonId", number);


--
-- Name: genres_name_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX genres_name_key ON public.genres USING btree (name);


--
-- Name: genres_slug_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX genres_slug_key ON public.genres USING btree (slug);


--
-- Name: platforms_slug_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX platforms_slug_key ON public.platforms USING btree (slug);


--
-- Name: profiles_userId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "profiles_userId_idx" ON public.profiles USING btree ("userId");


--
-- Name: refresh_tokens_token_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX refresh_tokens_token_idx ON public.refresh_tokens USING btree (token);


--
-- Name: refresh_tokens_token_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX refresh_tokens_token_key ON public.refresh_tokens USING btree (token);


--
-- Name: rentals_contentId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "rentals_contentId_idx" ON public.rentals USING btree ("contentId");


--
-- Name: rentals_userId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "rentals_userId_idx" ON public.rentals USING btree ("userId");


--
-- Name: reviews_contentId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "reviews_contentId_idx" ON public.reviews USING btree ("contentId");


--
-- Name: reviews_profileId_contentId_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX "reviews_profileId_contentId_key" ON public.reviews USING btree ("profileId", "contentId");


--
-- Name: season_translations_seasonId_language_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX "season_translations_seasonId_language_key" ON public.season_translations USING btree ("seasonId", language);


--
-- Name: seasons_contentId_number_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX "seasons_contentId_number_key" ON public.seasons USING btree ("contentId", number);


--
-- Name: subtitle_tracks_videoFileId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "subtitle_tracks_videoFileId_idx" ON public.subtitle_tracks USING btree ("videoFileId");


--
-- Name: tags_name_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX tags_name_key ON public.tags USING btree (name);


--
-- Name: tags_slug_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX tags_slug_key ON public.tags USING btree (slug);


--
-- Name: user_memberships_userId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "user_memberships_userId_idx" ON public.user_memberships USING btree ("userId");


--
-- Name: users_appleId_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX "users_appleId_key" ON public.users USING btree ("appleId");


--
-- Name: users_email_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX users_email_idx ON public.users USING btree (email);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_googleId_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX "users_googleId_key" ON public.users USING btree ("googleId");


--
-- Name: video_files_contentId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "video_files_contentId_idx" ON public.video_files USING btree ("contentId");


--
-- Name: video_files_episodeId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "video_files_episodeId_idx" ON public.video_files USING btree ("episodeId");


--
-- Name: video_files_status_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX video_files_status_idx ON public.video_files USING btree (status);


--
-- Name: video_qualities_videoFileId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "video_qualities_videoFileId_idx" ON public.video_qualities USING btree ("videoFileId");


--
-- Name: watch_history_profileId_contentId_episodeId_key; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE UNIQUE INDEX "watch_history_profileId_contentId_episodeId_key" ON public.watch_history USING btree ("profileId", "contentId", "episodeId");


--
-- Name: watch_history_profileId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "watch_history_profileId_idx" ON public.watch_history USING btree ("profileId");


--
-- Name: watch_history_updatedAt_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "watch_history_updatedAt_idx" ON public.watch_history USING btree ("updatedAt");


--
-- Name: watch_sessions_profileId_idx; Type: INDEX; Schema: public; Owner: peliplus
--

CREATE INDEX "watch_sessions_profileId_idx" ON public.watch_sessions USING btree ("profileId");


--
-- Name: ad_targets ad_targets_adId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.ad_targets
    ADD CONSTRAINT "ad_targets_adId_fkey" FOREIGN KEY ("adId") REFERENCES public.ads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ad_targets ad_targets_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.ad_targets
    ADD CONSTRAINT "ad_targets_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: audio_tracks audio_tracks_videoFileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.audio_tracks
    ADD CONSTRAINT "audio_tracks_videoFileId_fkey" FOREIGN KEY ("videoFileId") REFERENCES public.video_files(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comments comments_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: comments comments_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.comments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: comments comments_profileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: content_actors content_actors_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_actors
    ADD CONSTRAINT "content_actors_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public.actors(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: content_actors content_actors_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_actors
    ADD CONSTRAINT "content_actors_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: content_directors content_directors_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_directors
    ADD CONSTRAINT "content_directors_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: content_directors content_directors_directorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_directors
    ADD CONSTRAINT "content_directors_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES public.directors(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: content_genres content_genres_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_genres
    ADD CONSTRAINT "content_genres_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: content_genres content_genres_genreId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_genres
    ADD CONSTRAINT "content_genres_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES public.genres(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: content_tags content_tags_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_tags
    ADD CONSTRAINT "content_tags_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: content_tags content_tags_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_tags
    ADD CONSTRAINT "content_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: content_translations content_translations_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.content_translations
    ADD CONSTRAINT "content_translations_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: contents contents_ageRatingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.contents
    ADD CONSTRAINT "contents_ageRatingId_fkey" FOREIGN KEY ("ageRatingId") REFERENCES public.age_ratings(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: contents contents_platformId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.contents
    ADD CONSTRAINT "contents_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES public.platforms(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: episode_translations episode_translations_episodeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.episode_translations
    ADD CONSTRAINT "episode_translations_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES public.episodes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: episodes episodes_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.episodes
    ADD CONSTRAINT "episodes_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public.seasons(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: favorites favorites_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT "favorites_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: favorites favorites_profileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT "favorites_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: my_list my_list_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.my_list
    ADD CONSTRAINT "my_list_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: my_list my_list_profileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.my_list
    ADD CONSTRAINT "my_list_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: profiles profiles_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: recommendation_items recommendation_items_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.recommendation_items
    ADD CONSTRAINT "recommendation_items_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: refresh_tokens refresh_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: rentals rentals_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.rentals
    ADD CONSTRAINT "rentals_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: rentals rentals_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.rentals
    ADD CONSTRAINT "rentals_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: reviews reviews_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT "reviews_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: reviews reviews_profileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT "reviews_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: season_translations season_translations_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.season_translations
    ADD CONSTRAINT "season_translations_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public.seasons(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: seasons seasons_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT "seasons_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subtitle_tracks subtitle_tracks_videoFileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.subtitle_tracks
    ADD CONSTRAINT "subtitle_tracks_videoFileId_fkey" FOREIGN KEY ("videoFileId") REFERENCES public.video_files(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: thumbnails thumbnails_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.thumbnails
    ADD CONSTRAINT "thumbnails_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: thumbnails thumbnails_episodeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.thumbnails
    ADD CONSTRAINT "thumbnails_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES public.episodes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: user_memberships user_memberships_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.user_memberships
    ADD CONSTRAINT "user_memberships_planId_fkey" FOREIGN KEY ("planId") REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_memberships user_memberships_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.user_memberships
    ADD CONSTRAINT "user_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: video_files video_files_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.video_files
    ADD CONSTRAINT "video_files_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: video_files video_files_episodeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.video_files
    ADD CONSTRAINT "video_files_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES public.episodes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: video_qualities video_qualities_videoFileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.video_qualities
    ADD CONSTRAINT "video_qualities_videoFileId_fkey" FOREIGN KEY ("videoFileId") REFERENCES public.video_files(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: watch_history watch_history_contentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.watch_history
    ADD CONSTRAINT "watch_history_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES public.contents(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: watch_history watch_history_episodeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.watch_history
    ADD CONSTRAINT "watch_history_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES public.episodes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: watch_history watch_history_profileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.watch_history
    ADD CONSTRAINT "watch_history_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: watch_sessions watch_sessions_profileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: peliplus
--

ALTER TABLE ONLY public.watch_sessions
    ADD CONSTRAINT "watch_sessions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict iMQsezOYnfcEPzasd30ITlMsAG3NaDlrY9NapsrRjj7Dvz49YLS3AqG7qyQ6AUp

