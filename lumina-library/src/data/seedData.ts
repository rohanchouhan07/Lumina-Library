import type {
  ActivityEntry,
  Book,
  LibraryConfig,
  LibraryData,
  Loan,
  Member,
  Preferences,
  Reservation,
} from '@/types'
import { differenceInCalendarDays, startOfMonth, subMonths } from 'date-fns'
import { isoDaysFromNow, isoMonthsAgo } from '@/lib/dateUtils'

export const DATA_VERSION = 1

export const CATEGORIES = [
  'Computer Science',
  'Programming',
  'Engineering',
  'Mathematics',
  'Literature',
  'Management',
  'Science',
] as const

export const DEPARTMENTS = [
  'Computer Science',
  'Information Technology',
  'Electronics',
  'Mechanical',
  'Civil',
  'Mathematics',
  'Physics',
  'Management Studies',
  'Administration',
] as const

export const DEFAULT_CONFIG: LibraryConfig = {
  libraryName: 'Lumina Central Library',
  loanDurationDays: 14,
  maxRenewals: 2,
  renewalExtensionDays: 14,
  finePerDay: 5,
  studentBorrowLimit: 4,
  staffBorrowLimit: 8,
  reservationHoldDays: 3,
  allowStudentSelfCheckout: true,
  blockIssueOnUnpaidFines: false,
  fineBlockThreshold: 100,
}

export const DEFAULT_PREFERENCES: Preferences = {
  density: 'comfortable',
  motion: 'full',
  emailNotices: true,
  dueSoonReminders: true,
  newArrivalAlerts: false,
  defaultCatalogView: 'grid',
  accent: 'blue',
}

type BookSeed = Omit<Book, 'id' | 'status'> & { status?: Book['status'] }

const bookSeeds: BookSeed[] = [
  {
    isbn: '978-0132350884',
    title: 'Clean Code',
    author: 'Robert C. Martin',
    publisher: 'Prentice Hall',
    year: 2008,
    category: 'Programming',
    description:
      'A handbook of agile software craftsmanship that turns code quality into a habit. Packed with principles, patterns and case studies on writing code humans can read.',
    shelf: 'CS-A-01',
    totalCopies: 6,
    addedAt: isoMonthsAgo(26, 12),
    coverSeed: 101,
    tags: ['craft', 'refactoring', 'best practices'],
  },
  {
    isbn: '978-0262046305',
    title: 'Introduction to Algorithms',
    author: 'Thomas H. Cormen, Charles E. Leiserson',
    publisher: 'MIT Press',
    year: 2022,
    category: 'Computer Science',
    description:
      'The definitive reference on algorithms, covering sorting, graph theory, dynamic programming and complexity analysis with rigorous proofs and pseudocode.',
    shelf: 'CS-B-04',
    totalCopies: 5,
    addedAt: isoMonthsAgo(24, 4),
    coverSeed: 202,
    tags: ['algorithms', 'data structures', 'complexity'],
  },
  {
    isbn: '978-0135957059',
    title: 'The Pragmatic Programmer',
    author: 'David Thomas, Andrew Hunt',
    publisher: 'Addison-Wesley',
    year: 2019,
    category: 'Programming',
    description:
      'Timeless advice for developers: from tracer bullets and orthogonality to automation and estimation. A career-long companion for building dependable software.',
    shelf: 'CS-A-03',
    totalCopies: 4,
    addedAt: isoMonthsAgo(22, 18),
    coverSeed: 303,
    tags: ['career', 'methodology', 'engineering'],
  },
  {
    isbn: '978-0201633610',
    title: 'Design Patterns',
    author: 'Erich Gamma, Richard Helm, Ralph Johnson',
    publisher: 'Addison-Wesley',
    year: 1994,
    category: 'Computer Science',
    description:
      'The catalogue of reusable object-oriented solutions that shaped modern software architecture. Twenty-three patterns with intent, structure and consequences.',
    shelf: 'CS-B-02',
    totalCopies: 3,
    addedAt: isoMonthsAgo(30, 9),
    coverSeed: 404,
    tags: ['architecture', 'object oriented', 'patterns'],
  },
  {
    isbn: '978-0134610993',
    title: 'Artificial Intelligence: A Modern Approach',
    author: 'Stuart Russell, Peter Norvig',
    publisher: 'Pearson',
    year: 2020,
    category: 'Computer Science',
    description:
      'A comprehensive survey of intelligent agents, search, knowledge representation, probabilistic reasoning and machine learning — the standard AI curriculum text.',
    shelf: 'CS-C-01',
    totalCopies: 4,
    addedAt: isoMonthsAgo(18, 22),
    coverSeed: 505,
    tags: ['artificial intelligence', 'search', 'reasoning'],
  },
  {
    isbn: '978-0078022159',
    title: 'Database System Concepts',
    author: 'Abraham Silberschatz',
    publisher: 'McGraw-Hill',
    year: 2019,
    category: 'Computer Science',
    description:
      'From relational algebra to transaction management and modern distributed storage. A balanced mix of theory and practical database design.',
    shelf: 'CS-D-02',
    totalCopies: 5,
    addedAt: isoMonthsAgo(20, 11),
    coverSeed: 606,
    tags: ['database', 'sql', 'transactions'],
  },
  {
    isbn: '978-1119800361',
    title: 'Operating System Concepts',
    author: 'Abraham Silberschatz, Peter B. Galvin',
    publisher: 'Wiley',
    year: 2018,
    category: 'Computer Science',
    description:
      'The classic guide to processes, scheduling, memory management, file systems and concurrency, illustrated with real operating system implementations.',
    shelf: 'CS-D-05',
    totalCopies: 4,
    addedAt: isoMonthsAgo(21, 7),
    coverSeed: 707,
    tags: ['operating systems', 'concurrency', 'memory'],
  },
  {
    isbn: '978-0132126953',
    title: 'Computer Networks',
    author: 'Andrew S. Tanenbaum',
    publisher: 'Pearson',
    year: 2011,
    category: 'Computer Science',
    description:
      'An approachable tour of the network stack, from physical transmission and MAC protocols to routing, transport reliability and applied network security.',
    shelf: 'CS-E-03',
    totalCopies: 3,
    addedAt: isoMonthsAgo(28, 16),
    coverSeed: 808,
    tags: ['networking', 'protocols', 'security'],
  },
  {
    isbn: '978-0262035613',
    title: 'Deep Learning',
    author: 'Ian Goodfellow, Yoshua Bengio',
    publisher: 'MIT Press',
    year: 2016,
    category: 'Computer Science',
    description:
      'The mathematical backbone of modern neural networks: optimisation, regularisation, convolutional and recurrent architectures, and generative models.',
    shelf: 'CS-C-04',
    totalCopies: 2,
    addedAt: isoMonthsAgo(15, 5),
    coverSeed: 909,
    tags: ['machine learning', 'neural networks', 'research'],
  },
  {
    isbn: '978-0262510875',
    title: 'Structure and Interpretation of Computer Programs',
    author: 'Harold Abelson, Gerald Jay Sussman',
    publisher: 'MIT Press',
    year: 1996,
    category: 'Programming',
    description:
      'A foundational text on abstraction, recursion and interpreters that teaches programmers to think in processes rather than syntax.',
    shelf: 'CS-A-07',
    totalCopies: 2,
    addedAt: isoMonthsAgo(34, 3),
    coverSeed: 111,
    tags: ['functional programming', 'abstraction', 'classic'],
  },
  {
    isbn: '978-0134757599',
    title: 'Refactoring',
    author: 'Martin Fowler',
    publisher: 'Addison-Wesley',
    year: 2018,
    category: 'Programming',
    description:
      'A structured catalogue of small, safe transformations that improve the design of existing code without changing behaviour.',
    shelf: 'CS-A-05',
    totalCopies: 3,
    addedAt: isoMonthsAgo(12, 14),
    coverSeed: 222,
    tags: ['refactoring', 'code quality', 'agile'],
  },
  {
    isbn: '978-1491904244',
    title: "You Don't Know JS: Scope & Closures",
    author: 'Kyle Simpson',
    publisher: "O'Reilly Media",
    year: 2014,
    category: 'Programming',
    description:
      'A deep dive into JavaScript lexical scope, hoisting, closures and the module pattern — essential reading for serious web developers.',
    shelf: 'CS-A-09',
    totalCopies: 3,
    addedAt: isoMonthsAgo(9, 20),
    coverSeed: 333,
    tags: ['javascript', 'web', 'closures'],
  },
  {
    isbn: '978-8193328404',
    title: 'Higher Engineering Mathematics',
    author: 'B. S. Grewal',
    publisher: 'Khanna Publishers',
    year: 2017,
    category: 'Mathematics',
    description:
      'A staple of Indian engineering curricula covering calculus, linear algebra, differential equations, transforms and numerical methods with worked examples.',
    shelf: 'MA-A-01',
    totalCopies: 8,
    addedAt: isoMonthsAgo(32, 6),
    coverSeed: 444,
    tags: ['engineering mathematics', 'calculus', 'textbook'],
  },
  {
    isbn: '978-0321982384',
    title: 'Linear Algebra and Its Applications',
    author: 'Gilbert Strang',
    publisher: 'Cengage',
    year: 2016,
    category: 'Mathematics',
    description:
      'An intuitive treatment of vector spaces, eigenvalues and least squares, connecting matrices to real problems in science and engineering.',
    shelf: 'MA-A-04',
    totalCopies: 3,
    addedAt: isoMonthsAgo(19, 13),
    coverSeed: 555,
    tags: ['linear algebra', 'matrices', 'vectors'],
  },
  {
    isbn: '978-0201558029',
    title: 'Concrete Mathematics',
    author: 'Ronald L. Graham, Donald E. Knuth',
    publisher: 'Addison-Wesley',
    year: 1994,
    category: 'Mathematics',
    description:
      'A foundation for computer science: sums, recurrences, generating functions and discrete probability, written with wit and rigour.',
    shelf: 'MA-B-02',
    totalCopies: 2,
    addedAt: isoMonthsAgo(29, 8),
    coverSeed: 666,
    tags: ['discrete mathematics', 'recurrences', 'combinatorics'],
  },
  {
    isbn: '978-0471000051',
    title: 'Calculus, Volume 1',
    author: 'Tom M. Apostol',
    publisher: 'Wiley',
    year: 1991,
    category: 'Mathematics',
    description:
      'A rigorous first course in calculus emphasising proofs, limits and the integral, with applications to physics and geometry.',
    shelf: 'MA-B-05',
    totalCopies: 3,
    addedAt: isoMonthsAgo(27, 19),
    coverSeed: 777,
    tags: ['calculus', 'analysis', 'proofs'],
  },
  {
    isbn: '978-1118885840',
    title: 'Engineering Mechanics: Dynamics',
    author: 'J. L. Meriam, L. G. Kraige',
    publisher: 'Wiley',
    year: 2012,
    category: 'Engineering',
    description:
      'Kinematics and kinetics of particles and rigid bodies with a strong emphasis on free-body reasoning and applied problem solving.',
    shelf: 'EN-A-02',
    totalCopies: 4,
    addedAt: isoMonthsAgo(23, 10),
    coverSeed: 888,
    tags: ['mechanics', 'dynamics', 'core'],
  },
  {
    isbn: '978-8131808142',
    title: 'Strength of Materials',
    author: 'R. K. Bansal',
    publisher: 'Laxmi Publications',
    year: 2010,
    category: 'Engineering',
    description:
      'Stress, strain, bending, torsion and deflection explained for civil and mechanical students, with solved problems from examination papers.',
    shelf: 'EN-A-05',
    totalCopies: 5,
    addedAt: isoMonthsAgo(25, 2),
    coverSeed: 999,
    tags: ['materials', 'structures', 'civil'],
  },
  {
    isbn: '978-1119449737',
    title: 'Fundamentals of Thermodynamics',
    author: 'Claus Borgnakke, Richard E. Sonntag',
    publisher: 'Wiley',
    year: 2017,
    category: 'Engineering',
    description:
      'A modern introduction to energy systems, entropy and cycle analysis, bridging classical thermodynamics with contemporary applications.',
    shelf: 'EN-B-01',
    totalCopies: 3,
    addedAt: isoMonthsAgo(16, 24),
    coverSeed: 121,
    tags: ['thermodynamics', 'energy', 'cycles'],
  },
  {
    isbn: '978-0132091725',
    title: 'Digital Signal Processing',
    author: 'John G. Proakis, Dimitris G. Manolakis',
    publisher: 'Pearson',
    year: 2013,
    category: 'Engineering',
    description:
      'Discrete-time signals, z-transforms and filter design with practical MATLAB-oriented examples for electronics and communication engineers.',
    shelf: 'EN-C-03',
    totalCopies: 3,
    addedAt: isoMonthsAgo(14, 16),
    coverSeed: 232,
    tags: ['signals', 'filters', 'electronics'],
  },
  {
    isbn: '978-0743273565',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    publisher: 'Scribner',
    year: 1925,
    category: 'Literature',
    description:
      'A lyrical portrait of ambition and longing in the Jazz Age, told through the eyes of Nick Carraway on Long Island’s North Shore.',
    shelf: 'LI-A-01',
    totalCopies: 4,
    addedAt: isoMonthsAgo(31, 11),
    coverSeed: 343,
    tags: ['classic', 'american', 'novel'],
  },
  {
    isbn: '978-0385474542',
    title: 'Things Fall Apart',
    author: 'Chinua Achebe',
    publisher: 'Anchor Books',
    year: 1958,
    category: 'Literature',
    description:
      'The story of Okonkwo and the arrival of colonialism in Igbo society — a landmark of African literature studied across the world.',
    shelf: 'LI-A-03',
    totalCopies: 3,
    addedAt: isoMonthsAgo(20, 21),
    coverSeed: 454,
    tags: ['african literature', 'classic', 'postcolonial'],
  },
  {
    isbn: '978-0099578512',
    title: "Midnight's Children",
    author: 'Salman Rushdie',
    publisher: 'Vintage',
    year: 1981,
    category: 'Literature',
    description:
      'Saleem Sinai’s magical, sprawling account of modern India, where private memory and national history share the same pages.',
    shelf: 'LI-B-02',
    totalCopies: 2,
    addedAt: isoMonthsAgo(17, 17),
    coverSeed: 565,
    tags: ['indian literature', 'booker prize', 'magical realism'],
  },
  {
    isbn: '978-0006550433',
    title: 'The God of Small Things',
    author: 'Arundhati Roy',
    publisher: 'Fourth Estate',
    year: 1997,
    category: 'Literature',
    description:
      'A luminous, heartbreaking novel about forbidden love in Kerala, told with a fractured chronology and exquisite attention to detail.',
    shelf: 'LI-B-04',
    totalCopies: 3,
    addedAt: isoMonthsAgo(13, 9),
    coverSeed: 676,
    tags: ['indian literature', 'booker prize', 'family'],
  },
  {
    isbn: '978-0141439518',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    publisher: 'Penguin Classics',
    year: 1813,
    category: 'Literature',
    description:
      'Wit, class and courtship in Regency England. Elizabeth Bennet’s sharp observations remain a masterclass in narrative voice.',
    shelf: 'LI-C-01',
    totalCopies: 4,
    addedAt: isoMonthsAgo(33, 5),
    coverSeed: 787,
    tags: ['classic', 'romance', 'british'],
  },
  {
    isbn: '978-0312540523',
    title: 'Principles of Management',
    author: 'P. C. Tripathi, P. N. Reddy',
    publisher: 'Tata McGraw-Hill',
    year: 2012,
    category: 'Management',
    description:
      'Planning, organising, staffing, leading and controlling — management fundamentals mapped to Indian business practice and case studies.',
    shelf: 'MG-A-01',
    totalCopies: 6,
    addedAt: isoMonthsAgo(22, 12),
    coverSeed: 898,
    tags: ['management', 'organisations', 'textbook'],
  },
  {
    isbn: '978-0374533557',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    publisher: 'Farrar, Straus and Giroux',
    year: 2011,
    category: 'Management',
    description:
      'The two systems that drive how we judge, choose and bias ourselves — behavioural economics from a Nobel laureate.',
    shelf: 'MG-B-02',
    totalCopies: 3,
    addedAt: isoMonthsAgo(11, 23),
    coverSeed: 123,
    tags: ['psychology', 'decision making', 'economics'],
  },
  {
    isbn: '978-0670921607',
    title: 'The Lean Startup',
    author: 'Eric Ries',
    publisher: 'Portfolio Penguin',
    year: 2011,
    category: 'Management',
    description:
      'Validated learning, minimum viable products and build-measure-learn loops for launching products under uncertainty.',
    shelf: 'MG-B-04',
    totalCopies: 3,
    addedAt: isoMonthsAgo(10, 8),
    coverSeed: 234,
    tags: ['entrepreneurship', 'product', 'startups'],
  },
  {
    isbn: '978-0135874455',
    title: 'Organizational Behavior',
    author: 'Stephen P. Robbins',
    publisher: 'Pearson',
    year: 2019,
    category: 'Management',
    description:
      'Individual and group behaviour inside organisations: motivation, leadership, culture, conflict and change management.',
    shelf: 'MG-C-01',
    totalCopies: 3,
    addedAt: isoMonthsAgo(18, 14),
    coverSeed: 345,
    tags: ['behaviour', 'leadership', 'culture'],
  },
  {
    isbn: '978-0553380163',
    title: 'A Brief History of Time',
    author: 'Stephen Hawking',
    publisher: 'Bantam',
    year: 1988,
    category: 'Science',
    description:
      'From the Big Bang to black holes, a lucid tour of cosmology written for readers who want to understand the universe without equations.',
    shelf: 'SC-A-01',
    totalCopies: 4,
    addedAt: isoMonthsAgo(26, 3),
    coverSeed: 456,
    tags: ['cosmology', 'physics', 'popular science'],
  },
  {
    isbn: '978-0198788607',
    title: 'The Selfish Gene',
    author: 'Richard Dawkins',
    publisher: 'Oxford University Press',
    year: 1976,
    category: 'Science',
    description:
      'A gene-centred view of evolution that reframed how biologists think about altruism, cooperation and inheritance.',
    shelf: 'SC-A-04',
    totalCopies: 3,
    addedAt: isoMonthsAgo(24, 17),
    coverSeed: 567,
    tags: ['evolution', 'biology', 'classic'],
  },
  {
    isbn: '978-1118230718',
    title: 'Fundamentals of Physics',
    author: 'David Halliday, Robert Resnick',
    publisher: 'Wiley',
    year: 2013,
    category: 'Science',
    description:
      'Mechanics, waves, thermodynamics and electromagnetism with an exceptional problem set — the backbone of first-year physics.',
    shelf: 'SC-B-02',
    totalCopies: 7,
    addedAt: isoMonthsAgo(30, 20),
    coverSeed: 678,
    tags: ['physics', 'mechanics', 'textbook'],
  },
  {
    isbn: '978-0321971371',
    title: 'Organic Chemistry',
    author: 'Paula Yurkanis Bruice',
    publisher: 'Pearson',
    year: 2016,
    category: 'Science',
    description:
      'Reaction mechanisms and structure-reactivity relationships illustrated with biological and pharmaceutical examples.',
    shelf: 'SC-C-01',
    totalCopies: 3,
    addedAt: isoMonthsAgo(21, 15),
    coverSeed: 789,
    tags: ['chemistry', 'reactions', 'organic'],
  },
  {
    isbn: '978-0062316097',
    title: 'Sapiens: A Brief History of Humankind',
    author: 'Yuval Noah Harari',
    publisher: 'Harper',
    year: 2011,
    category: 'Science',
    description:
      'How cognitive, agricultural and scientific revolutions shaped our species — an ambitious synthesis of history and biology.',
    shelf: 'SC-A-07',
    totalCopies: 3,
    addedAt: isoMonthsAgo(8, 6),
    coverSeed: 890,
    tags: ['history', 'anthropology', 'popular science'],
  },
  {
    isbn: '978-0465050654',
    title: 'The Design of Everyday Things',
    author: 'Don Norman',
    publisher: 'Basic Books',
    year: 2013,
    category: 'Computer Science',
    description:
      'Affordances, signifiers and feedback: the psychology of how people interact with designed objects, interfaces and systems.',
    shelf: 'CS-F-02',
    totalCopies: 3,
    addedAt: isoMonthsAgo(7, 12),
    coverSeed: 901,
    tags: ['design', 'usability', 'interaction'],
  },
  {
    isbn: '978-0321486813',
    title: 'Compilers: Principles, Techniques, and Tools',
    author: 'Alfred V. Aho, Monica S. Lam',
    publisher: 'Pearson',
    year: 2006,
    category: 'Computer Science',
    description:
      'Lexical analysis, parsing, type checking and code generation — the dragon book remains the reference for language implementation.',
    shelf: 'CS-B-06',
    totalCopies: 2,
    addedAt: isoMonthsAgo(19, 27),
    coverSeed: 112,
    tags: ['compilers', 'languages', 'theory'],
  },
  {
    isbn: '978-0062315007',
    title: 'The Alchemist',
    author: 'Paulo Coelho',
    publisher: 'HarperOne',
    year: 1988,
    category: 'Literature',
    description:
      'A fable about Santiago’s journey toward a personal legend, widely borrowed for its meditative approach to purpose and risk.',
    shelf: 'LI-C-04',
    totalCopies: 5,
    addedAt: isoMonthsAgo(6, 18),
    coverSeed: 223,
    tags: ['fable', 'translated', 'fiction'],
  },
  {
    isbn: '978-8120346655',
    title: 'Data Structures Using C',
    author: 'Reema Thareja',
    publisher: 'Oxford University Press',
    year: 2014,
    category: 'Computer Science',
    description:
      'A practical introduction to arrays, linked lists, trees, heaps and graphs with C implementations and complexity notes.',
    shelf: 'CS-B-08',
    totalCopies: 6,
    addedAt: isoMonthsAgo(5, 9),
    coverSeed: 334,
    tags: ['data structures', 'c programming', 'textbook'],
  },
  {
    isbn: '978-0070635463',
    title: 'Marketing Management',
    author: 'Philip Kotler, Kevin Keller',
    publisher: 'Pearson',
    year: 2015,
    category: 'Management',
    description:
      'Segmentation, positioning and brand strategy with contemporary digital marketing frameworks and case discussions.',
    shelf: 'MG-C-03',
    totalCopies: 4,
    addedAt: isoMonthsAgo(4, 14),
    coverSeed: 445,
    tags: ['marketing', 'branding', 'strategy'],
  },
  {
    isbn: '978-0199489350',
    title: 'Indian Polity',
    author: 'M. Laxmikanth',
    publisher: 'McGraw-Hill',
    year: 2020,
    category: 'Literature',
    description:
      'A structured reference on the Indian Constitution, governance institutions and public administration, heavily used for competitive exams.',
    shelf: 'LI-D-02',
    totalCopies: 3,
    addedAt: isoMonthsAgo(3, 11),
    coverSeed: 556,
    tags: ['polity', 'constitution', 'reference'],
  },
  {
    isbn: '978-1491950357',
    title: 'Building Microservices',
    author: 'Sam Newman',
    publisher: "O'Reilly Media",
    year: 2021,
    category: 'Programming',
    description:
      'Service boundaries, deployment, observability and resilience for teams moving from monoliths to distributed architectures.',
    shelf: 'CS-A-11',
    totalCopies: 2,
    addedAt: isoMonthsAgo(2, 16),
    coverSeed: 667,
    tags: ['architecture', 'distributed systems', 'devops'],
  },
]

export const seedBooks: Book[] = bookSeeds.map((book, index) => ({
  ...book,
  id: `BK-${String(index + 1).padStart(3, '0')}`,
  status: book.status ?? 'active',
  totalCopies: Math.max(1, book.totalCopies),
}))

export const seedMembers: Member[] = [
  {
    id: 'M-1001',
    name: 'Dr. Meera Kulkarni',
    email: 'meera.kulkarni@lumina.edu',
    department: 'Administration',
    role: 'admin',
    status: 'active',
    joinedAt: isoMonthsAgo(40, 4),
    phone: '+91 98200 11223',
    notes: 'Library administrator demo profile.',
  },
  {
    id: 'M-1002',
    name: 'Arjun Nair',
    email: 'arjun.nair@lumina.edu',
    department: 'Administration',
    role: 'librarian',
    status: 'active',
    joinedAt: isoMonthsAgo(30, 8),
    phone: '+91 98111 55667',
    notes: 'Senior circulation librarian.',
  },
  {
    id: 'M-1003',
    name: 'Priya Deshmukh',
    email: 'priya.deshmukh@lumina.edu',
    department: 'Administration',
    role: 'librarian',
    status: 'active',
    joinedAt: isoMonthsAgo(19, 12),
    phone: '+91 99303 44556',
    notes: 'Cataloguing and reservations desk.',
  },
  {
    id: 'M-1004',
    name: 'Riya Sharma',
    email: 'riya.sharma@lumina.edu',
    department: 'Computer Science',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(28, 6),
    phone: '+91 98765 10004',
    notes: 'CSE third year. Demo student profile.',
  },
  {
    id: 'M-1005',
    name: 'Aditya Verma',
    email: 'aditya.verma@lumina.edu',
    department: 'Information Technology',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(25, 19),
  },
  {
    id: 'M-1006',
    name: 'Sneha Iyer',
    email: 'sneha.iyer@lumina.edu',
    department: 'Electronics',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(23, 3),
  },
  {
    id: 'M-1007',
    name: 'Karan Malhotra',
    email: 'karan.malhotra@lumina.edu',
    department: 'Mechanical',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(22, 21),
  },
  {
    id: 'M-1008',
    name: 'Fatima Sheikh',
    email: 'fatima.sheikh@lumina.edu',
    department: 'Civil',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(20, 9),
  },
  {
    id: 'M-1009',
    name: 'Rahul Bansal',
    email: 'rahul.bansal@lumina.edu',
    department: 'Mathematics',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(18, 25),
  },
  {
    id: 'M-1010',
    name: 'Ananya Rao',
    email: 'ananya.rao@lumina.edu',
    department: 'Physics',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(17, 7),
  },
  {
    id: 'M-1011',
    name: 'Vikram Singh',
    email: 'vikram.singh@lumina.edu',
    department: 'Management Studies',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(15, 29),
  },
  {
    id: 'M-1012',
    name: 'Neha Kulkarni',
    email: 'neha.kulkarni@lumina.edu',
    department: 'Computer Science',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(13, 16),
  },
  {
    id: 'M-1013',
    name: 'Ishaan Gupta',
    email: 'ishaan.gupta@lumina.edu',
    department: 'Information Technology',
    role: 'student',
    status: 'inactive',
    joinedAt: isoMonthsAgo(12, 2),
    notes: 'Membership paused for the current semester.',
  },
  {
    id: 'M-1014',
    name: 'Meghna Pillai',
    email: 'meghna.pillai@lumina.edu',
    department: 'Electronics',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(10, 23),
  },
  {
    id: 'M-1015',
    name: 'Dev Patel',
    email: 'dev.patel@lumina.edu',
    department: 'Mechanical',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(9, 10),
  },
  {
    id: 'M-1016',
    name: 'Aisha Khan',
    email: 'aisha.khan@lumina.edu',
    department: 'Management Studies',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(7, 18),
  },
  {
    id: 'M-1017',
    name: 'Siddharth Menon',
    email: 'siddharth.menon@lumina.edu',
    department: 'Civil',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(6, 5),
  },
  {
    id: 'M-1018',
    name: 'Tara Bhatt',
    email: 'tara.bhatt@lumina.edu',
    department: 'Mathematics',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(4, 27),
  },
  {
    id: 'M-1019',
    name: 'Nikhil Joshi',
    email: 'nikhil.joshi@lumina.edu',
    department: 'Physics',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(3, 12),
  },
  {
    id: 'M-1020',
    name: 'Zoya Mirza',
    email: 'zoya.mirza@lumina.edu',
    department: 'Computer Science',
    role: 'student',
    status: 'active',
    joinedAt: isoMonthsAgo(2, 8),
  },
]

/** Demo accounts shown on the login screen. */
export const DEMO_ACCOUNTS = {
  admin: 'M-1001',
  librarian: 'M-1002',
  student: 'M-1004',
} as const

interface LoanSeed {
  bookId: string
  memberId: string
  issuedDaysAgo: number
  dueInDays: number
  renewals?: number
  returnedDaysAgo?: number
  fine?: number
  issuedBy?: string
}

/**
 * Hand-authored circulation history. Active loans determine derived availability,
 * so the copy counts here stay within each title's total copies.
 */
const loanSeeds: LoanSeed[] = [
  // Active — demo student Riya Sharma (M-1004)
  { bookId: 'BK-001', memberId: 'M-1004', issuedDaysAgo: 12, dueInDays: 2 },
  { bookId: 'BK-002', memberId: 'M-1004', issuedDaysAgo: 18, dueInDays: -4 },
  { bookId: 'BK-021', memberId: 'M-1004', issuedDaysAgo: 14, dueInDays: 0 },

  // Active — other students
  { bookId: 'BK-013', memberId: 'M-1005', issuedDaysAgo: 6, dueInDays: 8 },
  { bookId: 'BK-032', memberId: 'M-1005', issuedDaysAgo: 21, dueInDays: -7 },
  { bookId: 'BK-009', memberId: 'M-1006', issuedDaysAgo: 4, dueInDays: 10 },
  { bookId: 'BK-009', memberId: 'M-1010', issuedDaysAgo: 9, dueInDays: 5 },
  { bookId: 'BK-022', memberId: 'M-1007', issuedDaysAgo: 2, dueInDays: 12, issuedBy: 'M-1003' },
  { bookId: 'BK-022', memberId: 'M-1012', issuedDaysAgo: 5, dueInDays: 9 },
  { bookId: 'BK-022', memberId: 'M-1014', issuedDaysAgo: 16, dueInDays: -2 },
  { bookId: 'BK-005', memberId: 'M-1011', issuedDaysAgo: 8, dueInDays: 6, renewals: 1 },
  { bookId: 'BK-027', memberId: 'M-1011', issuedDaysAgo: 3, dueInDays: 11 },
  { bookId: 'BK-007', memberId: 'M-1016', issuedDaysAgo: 10, dueInDays: 4 },
  { bookId: 'BK-017', memberId: 'M-1015', issuedDaysAgo: 13, dueInDays: 1 },
  { bookId: 'BK-024', memberId: 'M-1017', issuedDaysAgo: 19, dueInDays: -5 },
  { bookId: 'BK-030', memberId: 'M-1018', issuedDaysAgo: 1, dueInDays: 13 },
  { bookId: 'BK-034', memberId: 'M-1019', issuedDaysAgo: 7, dueInDays: 7, issuedBy: 'M-1003' },
  { bookId: 'BK-011', memberId: 'M-1020', issuedDaysAgo: 11, dueInDays: 3 },
  { bookId: 'BK-019', memberId: 'M-1009', issuedDaysAgo: 12, dueInDays: 2 },
  { bookId: 'BK-025', memberId: 'M-1008', issuedDaysAgo: 15, dueInDays: -1 },
  { bookId: 'BK-036', memberId: 'M-1006', issuedDaysAgo: 6, dueInDays: 8 },
  { bookId: 'BK-038', memberId: 'M-1004', issuedDaysAgo: 22, dueInDays: -8 },

  // Returned — recent
  { bookId: 'BK-003', memberId: 'M-1005', issuedDaysAgo: 30, dueInDays: -16, returnedDaysAgo: 14 },
  { bookId: 'BK-014', memberId: 'M-1012', issuedDaysAgo: 27, dueInDays: -13, returnedDaysAgo: 15, fine: 10 },
  { bookId: 'BK-004', memberId: 'M-1006', issuedDaysAgo: 24, dueInDays: -10, returnedDaysAgo: 9 },
  { bookId: 'BK-031', memberId: 'M-1010', issuedDaysAgo: 21, dueInDays: -7, returnedDaysAgo: 5, fine: 15 },
  { bookId: 'BK-008', memberId: 'M-1007', issuedDaysAgo: 18, dueInDays: -4, returnedDaysAgo: 6 },
  { bookId: 'BK-026', memberId: 'M-1011', issuedDaysAgo: 16, dueInDays: -2, returnedDaysAgo: 2 },
  { bookId: 'BK-033', memberId: 'M-1009', issuedDaysAgo: 14, dueInDays: 0, returnedDaysAgo: 1 },
  { bookId: 'BK-023', memberId: 'M-1014', issuedDaysAgo: 20, dueInDays: -6, returnedDaysAgo: 3, fine: 5 },

  ...generatedHistory(),
]


/** Deterministic PRNG so the seeded dataset is stable across reloads. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Builds a believable circulation history across the last eight months so the
 * analytics screens have a meaningful spread of issues and returns.
 * Everything generated here is already returned, so it never affects availability.
 */
function generatedHistory(): LoanSeed[] {
  const random = mulberry32(20241023)
  const bookIds = seedBooks.map((book) => book.id)
  const studentIds = seedMembers.filter((member) => member.role === 'student').map((member) => member.id)
  const today = new Date()
  const seeds: LoanSeed[] = []

  for (let monthsAgo = 7; monthsAgo >= 0; monthsAgo -= 1) {
    // Gentle upward trend with a mid-term dip, so the trend charts look believable.
    const base = 12 + Math.round((7 - monthsAgo) * 1.1)
    const seasonal = monthsAgo === 4 || monthsAgo === 5 ? -3 : 0
    const count = Math.max(7, base + seasonal + Math.round(random() * 4))
    const monthStart = startOfMonth(subMonths(today, monthsAgo))
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
    const lastUsableDay = monthsAgo === 0 ? today.getDate() - 1 : daysInMonth

    for (let i = 0; i < count; i += 1) {
      const day = 1 + Math.floor(random() * Math.max(1, lastUsableDay))
      const issuedDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), day, 11, 0, 0)
      const daysSinceIssued = differenceInCalendarDays(today, issuedDate)
      const loanLength = 14
      const lateBy = random() < 0.26 ? 1 + Math.floor(random() * 6) : -Math.floor(random() * 4)
      const heldFor = loanLength + lateBy
      if (daysSinceIssued <= heldFor) continue

      seeds.push({
        bookId: bookIds[Math.floor(random() * bookIds.length)],
        memberId: studentIds[Math.floor(random() * studentIds.length)],
        issuedDaysAgo: daysSinceIssued,
        dueInDays: daysSinceIssued - loanLength,
        returnedDaysAgo: daysSinceIssued - heldFor,
        fine: lateBy > 0 ? lateBy * 5 : 0,
        issuedBy: random() < 0.5 ? 'M-1002' : 'M-1003',
      })
    }
  }
  return seeds
}

function buildLoans(): Loan[] {
  return loanSeeds.map((seed, index) => {
    const issuedAt = isoDaysFromNow(-seed.issuedDaysAgo, 10, 15)
    const dueAt = isoDaysFromNow(seed.dueInDays, 10, 0)
    const returnedAt = seed.returnedDaysAgo != null ? isoDaysFromNow(-seed.returnedDaysAgo, 16, 30) : null
    return {
      id: `LN-${String(index + 1).padStart(4, '0')}`,
      bookId: seed.bookId,
      memberId: seed.memberId,
      issuedAt,
      dueAt,
      returnedAt,
      renewals: seed.renewals ?? 0,
      status: returnedAt ? 'returned' : 'active',
      fineAmount: returnedAt ? (seed.fine ?? 0) : null,
      issuedBy: seed.issuedBy ?? (index % 3 === 0 ? 'M-1003' : 'M-1002'),
    }
  })
}

export const seedLoans: Loan[] = buildLoans()

export const seedReservations: Reservation[] = [
  {
    id: 'RS-0001',
    bookId: 'BK-009',
    memberId: 'M-1004',
    createdAt: isoDaysFromNow(-3, 9, 20),
    status: 'pending',
    readyAt: null,
    expiresAt: null,
    fulfilledAt: null,
    cancelledAt: null,
  },
  {
    id: 'RS-0002',
    bookId: 'BK-022',
    memberId: 'M-1004',
    createdAt: isoDaysFromNow(-1, 14, 5),
    status: 'ready',
    readyAt: isoDaysFromNow(-1, 16, 10),
    expiresAt: isoDaysFromNow(2, 16, 10),
    fulfilledAt: null,
    cancelledAt: null,
  },
  {
    id: 'RS-0003',
    bookId: 'BK-009',
    memberId: 'M-1009',
    createdAt: isoDaysFromNow(-2, 11, 40),
    status: 'pending',
    readyAt: null,
    expiresAt: null,
    fulfilledAt: null,
    cancelledAt: null,
  },
  {
    id: 'RS-0004',
    bookId: 'BK-023',
    memberId: 'M-1012',
    createdAt: isoDaysFromNow(-6, 15, 15),
    status: 'cancelled',
    readyAt: null,
    expiresAt: null,
    fulfilledAt: null,
    cancelledAt: isoDaysFromNow(-4, 10, 0),
  },
  {
    id: 'RS-0005',
    bookId: 'BK-004',
    memberId: 'M-1016',
    createdAt: isoDaysFromNow(-9, 12, 0),
    status: 'fulfilled',
    readyAt: isoDaysFromNow(-8, 9, 30),
    expiresAt: isoDaysFromNow(-5, 9, 30),
    fulfilledAt: isoDaysFromNow(-7, 10, 15),
    cancelledAt: null,
  },
  {
    id: 'RS-0006',
    bookId: 'BK-022',
    memberId: 'M-1017',
    createdAt: isoDaysFromNow(-4, 13, 25),
    status: 'pending',
    readyAt: null,
    expiresAt: null,
    fulfilledAt: null,
    cancelledAt: null,
  },
  {
    id: 'RS-0007',
    bookId: 'BK-023',
    memberId: 'M-1014',
    createdAt: isoDaysFromNow(-13, 10, 45),
    status: 'expired',
    readyAt: isoDaysFromNow(-11, 10, 0),
    expiresAt: isoDaysFromNow(-8, 10, 0),
    fulfilledAt: null,
    cancelledAt: null,
  },
]

export const seedWishlists: Record<string, string[]> = {
  'M-1004': ['BK-005', 'BK-035', 'BK-034', 'BK-022'],
  'M-1005': ['BK-001', 'BK-011'],
  'M-1012': ['BK-009'],
}

export const seedActivity: ActivityEntry[] = [
  {
    id: 'AC-0001',
    at: isoDaysFromNow(-1, 16, 10),
    kind: 'reservation.ready',
    message: 'Reserved copy of “Things Fall Apart” marked ready for pickup',
    actor: 'Priya Deshmukh',
    bookId: 'BK-022',
    memberId: 'M-1004',
  },
  {
    id: 'AC-0002',
    at: isoDaysFromNow(-1, 15, 45),
    kind: 'loan.issued',
    message: 'Issued “A Brief History of Time” to Tara Bhatt',
    actor: 'Arjun Nair',
    bookId: 'BK-030',
    memberId: 'M-1018',
  },
  {
    id: 'AC-0003',
    at: isoDaysFromNow(-2, 11, 20),
    kind: 'loan.returned',
    message: 'Returned “Principles of Management” — no fine applied',
    actor: 'Arjun Nair',
    bookId: 'BK-026',
    memberId: 'M-1011',
  },
  {
    id: 'AC-0004',
    at: isoDaysFromNow(-3, 9, 20),
    kind: 'reservation.created',
    message: 'New reservation placed for “Deep Learning”',
    actor: 'Riya Sharma',
    bookId: 'BK-009',
    memberId: 'M-1004',
  },
  {
    id: 'AC-0005',
    at: isoDaysFromNow(-4, 17, 5),
    kind: 'book.updated',
    message: 'Copy count updated for “Data Structures Using C” (4 → 6)',
    actor: 'Dr. Meera Kulkarni',
    bookId: 'BK-038',
  },
  {
    id: 'AC-0006',
    at: isoDaysFromNow(-5, 10, 30),
    kind: 'member.created',
    message: 'Registered new member Zoya Mirza',
    actor: 'Priya Deshmukh',
    memberId: 'M-1020',
  },
  {
    id: 'AC-0007',
    at: isoDaysFromNow(-7, 12, 0),
    kind: 'loan.renewed',
    message: 'Renewed loan for “Artificial Intelligence: A Modern Approach”',
    actor: 'Vikram Singh',
    bookId: 'BK-005',
    memberId: 'M-1011',
  },
  {
    id: 'AC-0008',
    at: isoDaysFromNow(-9, 14, 50),
    kind: 'book.created',
    message: 'Added “Building Microservices” to the catalogue (2 copies)',
    actor: 'Dr. Meera Kulkarni',
    bookId: 'BK-041',
  },
]

/**
 * A neutral, empty dataset used while connected to the backend: nothing is
 * seeded and nothing is persisted as authority — the sheet supplies every row.
 */
export function emptyLibraryData(): LibraryData {
  return {
    version: DATA_VERSION,
    books: [],
    members: [],
    loans: [],
    reservations: [],
    activity: [],
    config: structuredClone(DEFAULT_CONFIG),
    wishlists: {},
    preferences: {},
  }
}

export function createSeedData(): LibraryData {
  return {
    version: DATA_VERSION,
    books: structuredClone(seedBooks),
    members: structuredClone(seedMembers),
    loans: structuredClone(seedLoans),
    reservations: structuredClone(seedReservations),
    activity: structuredClone(seedActivity),
    config: structuredClone(DEFAULT_CONFIG),
    wishlists: structuredClone(seedWishlists),
    preferences: {
      'M-1004': structuredClone(DEFAULT_PREFERENCES),
      'M-1001': { ...structuredClone(DEFAULT_PREFERENCES), density: 'compact' },
    },
  }
}
